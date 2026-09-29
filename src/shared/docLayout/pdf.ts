/**
 * Vẽ PDF từ kết quả của bộ dàn trang (spec mục 8.4) bằng pdf-lib - chạy được
 * trên Node (test) và Deno (Edge Function render-document-pdf). Toạ độ, font,
 * cỡ chữ lấy nguyên từ LayoutResult nên PDF khớp bản xem trên web.
 *
 * KHÔNG export từ index.ts: trang web không cần pdf-lib, import thẳng file này
 * ở phía server.
 */

import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { NOTO_SERIF, PT_PER_MM, measureTextMm, type FontStyleKey } from "./metrics";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, placeSignatureImage, type LayoutResult } from "./layout";
import { qrRects } from "./qr";

export interface PdfFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

export interface PdfAssets {
  fonts: PdfFontBytes;
  /** Ảnh theo URL (logo, con dấu, chữ ký đại diện) - thiếu thì bỏ qua ảnh đó. */
  images?: Record<string, Uint8Array | undefined>;
  /** Ảnh chữ ký người dùng theo slotId (PNG/JPEG). */
  signatures?: Record<string, Uint8Array | undefined>;
  /**
   * Để pdf-lib tự subset font. Mặc định false: font trong public/fonts đã được
   * subset sẵn bằng scripts/subset-fonts.py (~42 KB mỗi kiểu); subset của
   * pdf-lib làm mất glyph với Noto Serif.
   */
  subsetFonts?: boolean;
}

export interface PdfMeta {
  title: string;
  docNo?: string;
  contentSha256?: string;
  creationDate?: Date;
}

export interface CertificateEvent {
  atText: string;
  label: string;
  detail?: string;
}

/** Trang "Chứng nhận ký điện tử" cuối PDF (spec 8.4). */
export interface CertificateInfo {
  docNo: string;
  docId: string;
  title: string;
  issuerOrg?: string;
  contentSha256: string;
  signerName?: string | null;
  signedAtText?: string | null;
  signedIp?: string | null;
  userAgent?: string | null;
  methodText?: string | null;
  consentText?: string | null;
  events: CertificateEvent[];
  verifyUrl?: string;
  generatedAtText: string;
}

const mmToPt = (mm: number) => mm * PT_PER_MM;
const PAGE_W_PT = mmToPt(PAGE_WIDTH_MM);
const PAGE_H_PT = mmToPt(PAGE_HEIGHT_MM);

function hexColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function isPng(b: Uint8Array) {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isJpeg(b: Uint8Array) {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array | undefined): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    if (isPng(bytes)) return await doc.embedPng(bytes);
    if (isJpeg(bytes)) return await doc.embedJpg(bytes);
  } catch {
    // ảnh hỏng: bỏ qua thay vì làm hỏng cả PDF
  }
  return null;
}

/** Đặt ảnh giữ tỉ lệ trong khung (giống preserveAspectRatio "meet" của SVG). */
function fitContain(box: { x: number; y: number; w: number; h: number }, iw: number, ih: number, alignBottom: boolean) {
  const scale = Math.min(box.w / iw, box.h / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: box.x + (box.w - w) / 2, y: alignBottom ? box.y + box.h - h : box.y + (box.h - h) / 2, w, h };
}

type Fonts = Record<FontStyleKey, PDFFont>;

async function embedFonts(doc: PDFDocument, bytes: PdfFontBytes, subset: boolean): Promise<Fonts> {
  // Tắt kerning/ligature: độ rộng chữ khớp bảng metrics dùng chung (không kerning).
  const opts = { subset, features: { kern: false, liga: false, clig: false, calt: false } };
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(bytes.regular, opts),
    doc.embedFont(bytes.bold, opts),
    doc.embedFont(bytes.italic, opts),
    doc.embedFont(bytes.boldItalic, opts),
  ]);
  return { regular, bold, italic, boldItalic };
}

function drawRectMm(page: PDFPage, x: number, y: number, w: number, h: number, color = rgb(0, 0, 0)) {
  page.drawRectangle({ x: mmToPt(x), y: PAGE_H_PT - mmToPt(y + h), width: mmToPt(w), height: mmToPt(h), color, borderWidth: 0 });
}

function drawQr(page: PDFPage, value: string, x: number, y: number, size: number) {
  const qr = qrRects(value);
  const cell = size / qr.moduleCount;
  for (const r of qr.rects) {
    drawRectMm(page, x + r.x * cell, y + r.y * cell, r.w * cell + 0.01, cell + 0.01);
  }
}

async function drawLayoutPages(doc: PDFDocument, layout: LayoutResult, fonts: Fonts, assets: PdfAssets) {
  const imageCache = new Map<string, PDFImage | null>();
  const imageFor = async (src: string) => {
    if (!imageCache.has(src)) imageCache.set(src, await embedImage(doc, assets.images?.[src]));
    return imageCache.get(src) ?? null;
  };

  for (const pageLayout of layout.pages) {
    const page = doc.addPage([PAGE_W_PT, PAGE_H_PT]);
    const items = pageLayout.items;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      switch (item.kind) {
        case "text": {
          const size = item.sizePt;
          const color = hexColor(item.color);
          // Dòng căn đều vẽ từng từ riêng: thêm 1 dấu cách (không ảnh hưởng vị
          // trí) khi từ kế tiếp trên cùng dòng cách ra, để copy/tìm chữ trong
          // PDF không bị dính từ.
          const next = items[idx + 1];
          const gapAfter = next && next.kind === "text" && Math.abs(next.y - item.y) < 0.01 && next.x > item.x + item.width + 0.3;
          const text = gapAfter && !item.text.endsWith(" ") ? `${item.text} ` : item.text;
          page.drawText(text, { x: mmToPt(item.x), y: PAGE_H_PT - mmToPt(item.y), size, font: fonts[item.font], color });
          if (item.underline) {
            const m = NOTO_SERIF.styles[item.font];
            const offset = mmToPt(((-m.underlinePosition / m.unitsPerEm) * size) / PT_PER_MM);
            const thickness = Math.max((m.underlineThickness / m.unitsPerEm) * size, 0.4);
            const yPt = PAGE_H_PT - mmToPt(item.y) - offset;
            page.drawLine({ start: { x: mmToPt(item.x), y: yPt }, end: { x: mmToPt(item.x + item.width), y: yPt }, thickness, color });
          }
          break;
        }
        case "line":
          page.drawLine({
            start: { x: mmToPt(item.x1), y: PAGE_H_PT - mmToPt(item.y1) },
            end: { x: mmToPt(item.x2), y: PAGE_H_PT - mmToPt(item.y2) },
            thickness: mmToPt(item.thickness),
            color: hexColor(item.color),
          });
          break;
        case "image": {
          const img = await imageFor(item.src);
          if (!img) break;
          const r = fitContain({ x: item.x, y: item.y, w: item.w, h: item.h }, img.width, img.height, item.role === "issuer_signature");
          page.drawImage(img, { x: mmToPt(r.x), y: PAGE_H_PT - mmToPt(r.y + r.h), width: mmToPt(r.w), height: mmToPt(r.h) });
          break;
        }
        case "slot": {
          const img = await embedImage(doc, assets.signatures?.[item.slotId]);
          if (!img) break;
          const r = placeSignatureImage(item.imageArea, img.width, img.height);
          if (r.w > 0) page.drawImage(img, { x: mmToPt(r.x), y: PAGE_H_PT - mmToPt(r.y + r.h), width: mmToPt(r.w), height: mmToPt(r.h) });
          break;
        }
        case "qr":
          drawQr(page, item.value, item.x, item.y, item.size);
          break;
      }
    }
  }
}

// ─── Trang chứng nhận ─────────────────────────────────────────────────────

function wrap(text: string, font: FontStyleKey, sizePt: number, widthMm: number): string[] {
  const metrics = NOTO_SERIF.styles[font];
  const out: string[] = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (line && measureTextMm(metrics, next.trimEnd(), sizePt) > widthMm) {
        out.push(line.trimEnd());
        line = word.trimStart();
        // từ quá dài (vd mã hash): cắt theo ký tự
        while (measureTextMm(metrics, line, sizePt) > widthMm) {
          let cut = line.length;
          while (cut > 1 && measureTextMm(metrics, line.slice(0, cut), sizePt) > widthMm) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = next;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function drawCertificate(doc: PDFDocument, fonts: Fonts, info: CertificateInfo) {
  const page = doc.addPage([PAGE_W_PT, PAGE_H_PT]);
  const left = 20;
  const width = PAGE_WIDTH_MM - 40;
  let y = 22;
  const muted = hexColor("#6b7280");
  const black = hexColor("#000000");
  const gold = hexColor("#948154");

  const text = (s: string, x: number, yMm: number, font: FontStyleKey, size: number, color = black) =>
    page.drawText(s, { x: mmToPt(x), y: PAGE_H_PT - mmToPt(yMm), size, font: fonts[font], color });

  const centered = (s: string, font: FontStyleKey, size: number, color = black) => {
    const w = measureTextMm(NOTO_SERIF.styles[font], s, size);
    text(s, left + (width - w) / 2, y, font, size, color);
  };

  centered("CHỨNG NHẬN KÝ ĐIỆN TỬ", "bold", 15, gold);
  y += 6;
  centered(info.issuerOrg ? `Phát hành bởi ${info.issuerOrg}` : "Văn bản điện tử", "italic", 10, muted);
  y += 9;

  const labelW = 45;
  const row = (label: string, value: string | null | undefined, mono = false) => {
    const lines = wrap(value || "—", "regular", mono ? 8.5 : 10, width - labelW);
    text(label, left, y, "bold", 10);
    lines.forEach((l, i) => text(l, left + labelW, y + i * 5, "regular", mono ? 8.5 : 10));
    y += Math.max(1, lines.length) * 5 + 2;
  };

  row("Số văn bản", info.docNo);
  row("Tiêu đề", info.title);
  row("Mã tài liệu", info.docId, true);
  row("SHA-256 nội dung", info.contentSha256, true);
  row("Người ký", info.signerName);
  row("Thời điểm ký", info.signedAtText);
  row("Phương thức", info.methodText);
  row("Địa chỉ IP", info.signedIp);
  row("Thiết bị", info.userAgent ? info.userAgent.slice(0, 220) : null);
  row("Xác nhận", info.consentText);

  y += 3;
  page.drawLine({ start: { x: mmToPt(left), y: PAGE_H_PT - mmToPt(y) }, end: { x: mmToPt(left + width), y: PAGE_H_PT - mmToPt(y) }, thickness: 0.5, color: muted });
  y += 7;
  text("NHẬT KÝ", left, y, "bold", 11, gold);
  y += 7;
  for (const ev of info.events) {
    if (y > PAGE_HEIGHT_MM - 45) break;
    text(ev.atText, left, y, "regular", 9, muted);
    const lines = wrap(`${ev.label}${ev.detail ? ` - ${ev.detail}` : ""}`, "regular", 9.5, width - 52);
    lines.forEach((l, i) => text(l, left + 52, y + i * 4.6, "regular", 9.5));
    y += Math.max(1, lines.length) * 4.6 + 1.6;
  }

  const bottom = PAGE_HEIGHT_MM - 38;
  if (info.verifyUrl) {
    drawQr(page, info.verifyUrl, left, bottom, 22);
    const lines = wrap(`Quét mã hoặc mở ${info.verifyUrl} để kiểm tra văn bản này có đúng bản gốc đã ký hay không.`, "regular", 9, width - 30);
    lines.forEach((l, i) => text(l, left + 28, bottom + 5 + i * 4.5, "regular", 9, muted));
  }
  text(`Tạo tự động lúc ${info.generatedAtText}. Mọi thay đổi nội dung sau khi ký đều làm mã SHA-256 không còn khớp.`, left, PAGE_HEIGHT_MM - 10, "italic", 8, muted);
}

/** Tạo PDF hoàn chỉnh: các trang văn bản + (tuỳ chọn) trang chứng nhận ký. */
export async function renderPdf(layout: LayoutResult, assets: PdfAssets, meta: PdfMeta, certificate?: CertificateInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedFonts(doc, assets.fonts, assets.subsetFonts === true);

  await drawLayoutPages(doc, layout, fonts, assets);
  if (certificate) drawCertificate(doc, fonts, certificate);

  doc.setTitle(meta.title || meta.docNo || "Văn bản");
  doc.setAuthor("VinClub");
  doc.setCreator("VinClub e-sign");
  doc.setProducer("VinClub e-sign (pdf-lib)");
  if (meta.docNo) doc.setSubject(meta.docNo);
  if (meta.contentSha256) doc.setKeywords([meta.contentSha256]);
  if (meta.creationDate) {
    doc.setCreationDate(meta.creationDate);
    doc.setModificationDate(meta.creationDate);
  }
  return await doc.save({ useObjectStreams: true });
}
