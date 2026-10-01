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
  /** Ảnh của trường chữ ký / ký nháy theo fieldId. */
  fieldImages?: Record<string, Uint8Array | undefined>;
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
        case "field": {
          if (item.type !== "signature" && item.type !== "initials") break;
          const key = `field:${item.fieldId}`;
          if (!imageCache.has(key)) imageCache.set(key, await embedImage(doc, assets.fieldImages?.[item.fieldId]));
          const img = imageCache.get(key);
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

/** Tạo PDF từ các trang văn bản đã dàn trang. */
export async function renderPdf(layout: LayoutResult, assets: PdfAssets, meta: PdfMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedFonts(doc, assets.fonts, assets.subsetFonts === true);

  await drawLayoutPages(doc, layout, fonts, assets);

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
