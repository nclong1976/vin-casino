// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * Bộ dàn trang văn bản (spec mục 3). Đầu vào là Delta đã thay biến +
 * snapshot khung văn bản + cấu hình khung ký; đầu ra là danh sách trang A4
 * với toạ độ tuyệt đối theo mm của từng mảnh chữ, ảnh, đường kẻ và khung ký.
 *
 * Trình duyệt (LetterheadRenderer, vẽ bằng SVG) và Edge Function (pdf-lib)
 * cùng vẽ từ đúng kết quả này, nên xuống dòng, ngắt trang và vị trí chữ ký
 * luôn giống nhau.
 *
 * Hệ toạ độ: gốc góc trên-trái trang, đơn vị mm. Toạ độ y của mảnh chữ là
 * BASELINE (SVG <text y> và pdf-lib drawText đều đặt chữ theo baseline).
 */

import type { Delta, DeltaAttributes, DeltaOp } from "./types.ts";
import { isFieldAnchor, normalizeDelta, normalizeFieldId } from "./resolve.ts";
import {
  NOTO_SERIF,
  PT_PER_MM,
  baselineOffsetMm,
  isSupportedChar,
  measureTextMm,
  styleKey,
  type FontFamilyMetrics,
  type FontStyleKey,
} from "./metrics.ts";

// ─── Kiểu dữ liệu khung văn bản / bố cục ─────────────────────────────────

export interface LetterheadHeader {
  logo_url?: string | null;
  /** Chiều cao logo (mm). Không đặt = khung 12×12 mm như trước (giữ nguyên văn bản cũ). */
  logo_size_mm?: number | null;
  org_name?: string;
  org_sub?: string;
  show_national_motto?: boolean;
  doc_no_pattern?: string;
  place?: string;
}

export interface LetterheadFooter {
  lines?: string[];
  show_page_number?: boolean;
  show_hash?: boolean;
  show_qr?: boolean;
}

export interface LetterheadIssuer {
  name?: string;
  title?: string;
  seal_url?: string | null;
  signature_url?: string | null;
}

export interface LetterheadTheme {
  primary?: string;
  font_body?: string;
  font_size_pt?: number;
  line_height?: number;
  margins_mm?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface LetterheadSnapshot {
  header?: LetterheadHeader;
  footer?: LetterheadFooter;
  issuer?: LetterheadIssuer;
  theme?: LetterheadTheme;
}

export interface SlotConfig {
  id: string;
  role: "recipient" | "issuer";
  column: "left" | "right";
  align?: "left" | "center" | "right";
  heading?: string;
  hint?: string;
  box: { w_mm: number; h_mm: number; offset_x_mm?: number; offset_y_mm?: number };
  show_name?: boolean;
  show_signed_at?: boolean;
  required?: boolean;
  fill?: "auto_on_dispatch";
}

export type FieldType = "signature" | "initials" | "date" | "checkbox" | "text";

export type FieldAnchor =
  | { kind: "flow" }
  | { kind: "every_page_footer"; align?: "left" | "right"; pages?: "all" | "all_but_last" };

/**
 * Trường người nhận điền khi ký (spec hợp đồng mục 2.2, 4.3). Vị trí thật
 * (trang, x, y) do bộ dàn trang tính theo nội dung của từng người nhận:
 * - "flow": ngay sau đoạn chứa điểm neo `{ field_anchor: id }` trong thân
 *   (không có điểm neo thì đặt sau thân văn bản), lệch theo offset_mm.
 * - "every_page_footer": lặp ở chân mọi trang (ký nháy).
 */
export interface FieldConfig {
  id: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  size_mm: { w: number; h: number };
  anchor?: FieldAnchor;
  offset_mm?: { x?: number; y?: number };
  options?: { must_be_checked?: boolean; max_length?: number; placeholder?: string };
}

export interface TemplateLayout {
  page?: { size?: "A4"; orientation?: "portrait" };
  signature_zone?: { placement?: "after_body"; keep_together?: boolean; gap_top_mm?: number; columns?: number };
  slots?: SlotConfig[];
  fields?: FieldConfig[];
  /** Ghi "Chữ ký minh hoạ" dưới chữ ký/ký nháy và ở chân trang. Mặc định bật. */
  illustrative_label?: boolean;
}

export const DEFAULT_THEME: Required<Omit<LetterheadTheme, "margins_mm">> & {
  margins_mm: { top: number; right: number; bottom: number; left: number };
} = {
  primary: "#948154",
  font_body: "Noto Serif",
  font_size_pt: 13,
  line_height: 1.4,
  margins_mm: { top: 20, right: 15, bottom: 25, left: 20 },
};

export const DEFAULT_LAYOUT: Required<TemplateLayout> = {
  page: { size: "A4", orientation: "portrait" },
  signature_zone: { placement: "after_body", keep_together: true, gap_top_mm: 8, columns: 2 },
  slots: [
    {
      id: "recipient",
      role: "recipient",
      column: "left",
      align: "center",
      heading: "NGƯỜI NHẬN",
      hint: "(Ký, ghi rõ họ tên)",
      box: { w_mm: 60, h_mm: 25, offset_x_mm: 0, offset_y_mm: 0 },
      show_name: true,
      show_signed_at: true,
      required: true,
    },
    {
      id: "issuer",
      role: "issuer",
      column: "right",
      align: "center",
      heading: "ĐẠI DIỆN BÊN PHÁT HÀNH",
      hint: "(Ký, đóng dấu)",
      box: { w_mm: 60, h_mm: 30, offset_x_mm: 0, offset_y_mm: 0 },
      fill: "auto_on_dispatch",
      show_name: true,
    },
  ],
  fields: [],
  // Mặc định KHÔNG ghi "Chữ ký mang tính minh hoạ" - Admin bật lại theo từng mẫu nếu cần.
  illustrative_label: false,
};

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
/** Giới hạn số trang (spec 8.4) - vượt quá thì chặn xuất bản/phát hành. */
export const MAX_PAGES = 10;

// ─── Kiểu dữ liệu đầu ra ──────────────────────────────────────────────────

export interface TextItem {
  kind: "text";
  x: number;
  /** Baseline. */
  y: number;
  text: string;
  font: FontStyleKey;
  sizePt: number;
  color: string;
  underline?: boolean;
  /** Độ rộng đo theo bảng metrics - renderer ép đúng độ rộng này. */
  width: number;
  /** Biến chưa được thay (chỉ xuất hiện ở preview mẫu). */
  placeholder?: boolean;
}

export interface ImageItem {
  kind: "image";
  role: "logo" | "seal" | "issuer_signature";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LineItem {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: string;
}

export interface SlotItem {
  kind: "slot";
  slotId: string;
  role: SlotConfig["role"];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vùng dành cho ảnh chữ ký (trừ dải tên/giờ ký ở đáy khung). */
  imageArea: { x: number; y: number; w: number; h: number };
}

export interface QrItem {
  kind: "qr";
  x: number;
  y: number;
  size: number;
  value: string;
}

export interface FieldItem {
  kind: "field";
  fieldId: string;
  type: FieldType;
  /** Lần xuất hiện thứ mấy (ký nháy lặp mỗi trang). */
  occurrence: number;
  required: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vùng đặt ảnh chữ ký / ký nháy. */
  imageArea: { x: number; y: number; w: number; h: number };
}

export type LayoutItem = TextItem | ImageItem | LineItem | SlotItem | QrItem | FieldItem;

export interface PageLayout {
  index: number;
  width: number;
  height: number;
  items: LayoutItem[];
}

export interface SlotBox {
  page: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
}

export interface LayoutResult {
  pages: PageLayout[];
  slotBoxes: Record<string, SlotBox>;
  /** Mỗi trường 1 mảng vị trí (ký nháy có thể xuất hiện nhiều trang). */
  fieldBoxes: Record<string, SlotBox[]>;
  pageCount: number;
  exceedsMaxPages: boolean;
  /** Ký tự không có trong font - UI cảnh báo trước khi phát hành. */
  unsupportedChars: string[];
}

/** Giá trị trường dạng chữ / ô tick - ảnh chữ ký, ký nháy do renderer vẽ. */
export interface FieldFill {
  text?: string | null;
  checked?: boolean;
}

/** Nội dung điền vào khung ký (tên, giờ ký) - ảnh chữ ký do renderer vẽ. */
export interface SlotFill {
  name?: string | null;
  signedAtText?: string | null;
}

export interface LayoutInput {
  letterhead?: LetterheadSnapshot | null;
  layout?: TemplateLayout | null;
  title?: string;
  body: Delta | null | undefined;
  docNo?: string;
  /** "Hà Nội, ngày 28 tháng 09 năm 2026" - đã định dạng sẵn. */
  placeDateText?: string;
  /** Dòng footer đã thay biến. Mặc định lấy letterhead.footer.lines. */
  footerLines?: string[];
  /** 8 ký tự đầu content_sha256 (nếu footer.show_hash). */
  hashShort?: string;
  /** URL trang /verify cho mã QR (nếu footer.show_qr). */
  verifyUrl?: string;
  slotFills?: Record<string, SlotFill>;
  fieldFills?: Record<string, FieldFill>;
  fonts?: FontFamilyMetrics;
}

// ─── Hằng số trình bày ────────────────────────────────────────────────────

const TEXT_COLOR = "#000000";
const MUTED_COLOR = "#6b7280";
const HEADER_SIZE_PT = 11;
const MOTTO_SIZE_PT = 12;
const TITLE_SIZE_PT = 14;
const SLOT_HEADING_SIZE_PT = 11;
const SLOT_HINT_SIZE_PT = 9;
const SLOT_NAME_SIZE_PT = 11;
const SLOT_TIME_SIZE_PT = 8;
const FOOTER_SIZE_PT = 8;
const HEADING_SIZES: Record<number, number> = { 1: 16, 2: 14, 3: 13 };
const LIST_INDENT_MM = 7;
const BLOCK_INDENT_MM = 10;
const QR_SIZE_MM = 14;
const FOOTER_TOP_FROM_BOTTOM_MM = 18;
const EPS = 1e-6;

/** Dải tên/giờ ký bên trong khung ký (spec 7.4). */
export const SLOT_PADDING_MM = 2;
export const SLOT_NAME_BAND_MM = 6;
export const SLOT_TIME_BAND_MM = 4;

function lineHeightMm(sizePt: number, factor: number): number {
  return (sizePt * factor) / PT_PER_MM;
}

// ─── Tách dòng ────────────────────────────────────────────────────────────

interface RunStyle {
  font: FontStyleKey;
  sizePt: number;
  color: string;
  underline: boolean;
  placeholder: boolean;
}

interface Piece extends RunStyle {
  text: string;
  width: number;
  space: boolean;
}

interface Line {
  pieces: Piece[];
  width: number;
}

class Measurer {
  unsupported = new Set<string>();
  constructor(private fonts: FontFamilyMetrics) {}

  width(text: string, font: FontStyleKey, sizePt: number): number {
    const metrics = this.fonts.styles[font];
    for (const ch of text) {
      if (ch.trim() && !isSupportedChar(metrics, ch)) this.unsupported.add(ch);
    }
    return measureTextMm(metrics, text, sizePt);
  }

  baseline(font: FontStyleKey, sizePt: number, lineHeight: number): number {
    return baselineOffsetMm(this.fonts.styles[font], sizePt, lineHeight);
  }
}

function sameStyle(
  a: Pick<RunStyle, "font" | "sizePt" | "color"> & { underline?: boolean; placeholder?: boolean },
  b: Pick<RunStyle, "font" | "sizePt" | "color"> & { underline?: boolean; placeholder?: boolean },
): boolean {
  return (
    a.font === b.font &&
    a.sizePt === b.sizePt &&
    a.color === b.color &&
    !!a.underline === !!b.underline &&
    !!a.placeholder === !!b.placeholder
  );
}

function toPieces(runs: { text: string; style: RunStyle }[], m: Measurer): Piece[] {
  const pieces: Piece[] = [];
  for (const run of runs) {
    for (const token of run.text.split(/(\s+)/)) {
      if (!token) continue;
      const space = /^\s+$/.test(token);
      const text = space ? " " : token;
      pieces.push({ ...run.style, text, space, width: m.width(text, run.style.font, run.style.sizePt) });
    }
  }
  return pieces;
}

/** Cắt một từ dài hơn cả dòng thành các mảnh vừa khít. */
function splitLongWord(piece: Piece, avail: number, m: Measurer): Piece[] {
  const out: Piece[] = [];
  let buf = "";
  for (const ch of piece.text) {
    const next = buf + ch;
    if (buf && m.width(next, piece.font, piece.sizePt) > avail + EPS) {
      out.push({ ...piece, text: buf, width: m.width(buf, piece.font, piece.sizePt) });
      buf = ch;
    } else {
      buf = next;
    }
  }
  if (buf) out.push({ ...piece, text: buf, width: m.width(buf, piece.font, piece.sizePt) });
  return out;
}

function trimTrailingSpaces(pieces: Piece[]): Piece[] {
  let end = pieces.length;
  while (end > 0 && pieces[end - 1].space) end--;
  return pieces.slice(0, end);
}

function contentWidth(pieces: Piece[]): number {
  return pieces.reduce((sum, p) => sum + p.width, 0);
}

/** Ngắt dòng tham lam (greedy) theo từ. */
function breakLines(pieces: Piece[], avail: number, m: Measurer): Line[] {
  const lines: Line[] = [];
  let cur: Piece[] = [];
  let curWidth = 0;

  const flush = () => {
    const trimmed = trimTrailingSpaces(cur);
    lines.push({ pieces: trimmed, width: contentWidth(trimmed) });
    cur = [];
    curWidth = 0;
  };

  const queue = [...pieces];
  while (queue.length) {
    const piece = queue.shift() as Piece;
    if (piece.space) {
      if (cur.length) {
        cur.push(piece);
        curWidth += piece.width;
      }
      continue;
    }
    const widthWithoutTrailing = contentWidth(trimTrailingSpaces(cur));
    const fitsAfterSpaces = curWidth + piece.width <= avail + EPS;
    if (fitsAfterSpaces) {
      cur.push(piece);
      curWidth += piece.width;
    } else if (widthWithoutTrailing > 0) {
      flush();
      queue.unshift(piece);
    } else {
      // Dòng đang trống mà từ vẫn không vừa: cắt nhỏ từ theo ký tự.
      const parts = splitLongWord(piece, avail, m);
      cur.push(parts[0]);
      curWidth += parts[0].width;
      if (parts.length > 1) {
        flush();
        queue.unshift(...parts.slice(1));
      }
    }
  }
  if (cur.length || lines.length === 0) flush();
  return lines;
}

// ─── Đoạn văn từ Delta ────────────────────────────────────────────────────

interface Paragraph {
  runs: { text: string; attrs?: DeltaAttributes; placeholder?: boolean }[];
  block: DeltaAttributes;
  /** Trường neo trong đoạn này - đặt ngay sau đoạn. */
  anchors: string[];
}

function toParagraphs(body: Delta | null | undefined): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let runs: Paragraph["runs"] = [];
  let anchors: string[] = [];
  for (const op of normalizeDelta(body).ops as DeltaOp[]) {
    if (op.insert === "\n") {
      paragraphs.push({ runs, block: op.attributes || {}, anchors });
      runs = [];
      anchors = [];
    } else if (isFieldAnchor(op.insert)) {
      anchors.push(op.insert.field_anchor);
    } else if (typeof op.insert === "string") {
      runs.push({ text: op.insert, attrs: op.attributes });
    } else {
      runs.push({ text: `{{${op.insert.variable}}}`, attrs: op.attributes, placeholder: true });
    }
  }
  return paragraphs;
}

// ─── Bộ dàn trang ─────────────────────────────────────────────────────────

class PageBuilder {
  pages: PageLayout[] = [];
  y = 0;

  constructor(
    public top: number,
    public bottom: number,
  ) {
    this.newPage();
  }

  get page(): PageLayout {
    return this.pages[this.pages.length - 1];
  }

  newPage() {
    this.pages.push({ index: this.pages.length, width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM, items: [] });
    this.y = this.top;
  }

  remaining(): number {
    return this.bottom - this.y;
  }

  /** Sang trang mới nếu không đủ chỗ cho khối cao `height` (trừ khi trang đang trống). */
  ensure(height: number) {
    if (height > this.remaining() + EPS && this.y > this.top + EPS) this.newPage();
  }

  add(item: LayoutItem) {
    this.page.items.push(item);
  }
}

function emitLine(
  b: PageBuilder,
  line: Line,
  x: number,
  avail: number,
  align: DeltaAttributes["align"],
  justify: boolean,
  baselineY: number,
) {
  if (!line.pieces.length) return;
  const spaces = line.pieces.filter((p) => p.space).length;
  const doJustify = justify && spaces > 0;
  const extraPerSpace = doJustify ? (avail - line.width) / spaces : 0;
  let cursor = x;
  if (!doJustify) {
    if (align === "center") cursor = x + (avail - line.width) / 2;
    else if (align === "right") cursor = x + avail - line.width;
  }

  // Gộp các mảnh liền kề cùng kiểu chữ thành một TextItem. Khi căn đều, mỗi
  // từ là một item riêng vì khoảng trắng giữa các từ được nới ra.
  const items: TextItem[] = [];
  let open = false;
  for (const piece of line.pieces) {
    if (doJustify && piece.space) {
      open = false;
      cursor += piece.width + extraPerSpace;
      continue;
    }
    const last = items[items.length - 1];
    if (open && last && sameStyle(last, piece)) {
      last.text += piece.text;
      last.width += piece.width;
    } else {
      items.push({
        kind: "text",
        x: cursor,
        y: baselineY,
        text: piece.text,
        font: piece.font,
        sizePt: piece.sizePt,
        color: piece.color,
        width: piece.width,
        ...(piece.underline ? { underline: true } : {}),
        ...(piece.placeholder ? { placeholder: true } : {}),
      });
      open = true;
    }
    cursor += piece.width;
  }
  for (const item of items) if (item.text.trim()) b.add(item);
}

/** Dàn một khối chữ 1 kiểu (header, tiêu đề, chữ trong khung ký) vào cột. */
function placeSimpleText(
  b: PageBuilder,
  m: Measurer,
  text: string,
  opts: { x: number; width: number; font: FontStyleKey; sizePt: number; color?: string; align?: "left" | "center" | "right"; lineFactor?: number },
): { lines: number; lastLineWidth: number } {
  if (!text) return { lines: 0, lastLineWidth: 0 };
  const style: RunStyle = { font: opts.font, sizePt: opts.sizePt, color: opts.color || TEXT_COLOR, underline: false, placeholder: false };
  const lines = breakLines(toPieces([{ text, style }], m), opts.width, m);
  const lh = lineHeightMm(opts.sizePt, opts.lineFactor ?? 1.3);
  for (const line of lines) {
    emitLine(b, line, opts.x, opts.width, opts.align || "left", false, b.y + m.baseline(opts.font, opts.sizePt, lh));
    b.y += lh;
  }
  return { lines: lines.length, lastLineWidth: lines[lines.length - 1]?.width || 0 };
}

function measureSimpleHeight(m: Measurer, text: string, width: number, font: FontStyleKey, sizePt: number, lineFactor = 1.3): number {
  if (!text) return 0;
  const style: RunStyle = { font, sizePt, color: TEXT_COLOR, underline: false, placeholder: false };
  return breakLines(toPieces([{ text, style }], m), width, m).length * lineHeightMm(sizePt, lineFactor);
}

export const LOGO_SIZE_MM = { min: 8, max: 40, legacy: 12 };

/**
 * Khung logo: cao = logo_size_mm, rộng tối đa 3 lần chiều cao (logo ngang)
 * nhưng không quá cột trái; ảnh luôn giữ tỉ lệ bên trong khung. Khung cũ
 * (không đặt cỡ) giữ đúng 12×12 mm để văn bản đã phát hành không đổi.
 */
export function logoBox(sizeMm: number | null | undefined, maxW: number): { w: number; h: number } {
  const n = Number(sizeMm);
  if (sizeMm === null || sizeMm === undefined || !Number.isFinite(n)) return { w: LOGO_SIZE_MM.legacy, h: LOGO_SIZE_MM.legacy };
  const h = Math.min(LOGO_SIZE_MM.max, Math.max(LOGO_SIZE_MM.min, n));
  return { w: Math.min(maxW, h * 3), h };
}

function layoutHeader(b: PageBuilder, m: Measurer, input: LayoutInput, margins: { left: number; right: number }) {
  const header = input.letterhead?.header || {};
  const contentW = PAGE_WIDTH_MM - margins.left - margins.right;
  const leftW = contentW * 0.42;
  const rightX = margins.left + leftW;
  const rightW = contentW - leftW;
  const startY = b.y;

  // Cột trái: logo, tên đơn vị, số văn bản.
  if (header.logo_url) {
    const { w, h } = logoBox(header.logo_size_mm, leftW);
    b.add({ kind: "image", role: "logo", src: header.logo_url, x: margins.left + (leftW - w) / 2, y: b.y, w, h });
    b.y += h + 1.5;
  }
  placeSimpleText(b, m, (header.org_name || "").toUpperCase(), { x: margins.left, width: leftW, font: "bold", sizePt: HEADER_SIZE_PT, align: "center" });
  placeSimpleText(b, m, header.org_sub || "", { x: margins.left, width: leftW, font: "regular", sizePt: HEADER_SIZE_PT - 1, align: "center" });
  if (input.docNo) {
    b.y += 1;
    placeSimpleText(b, m, `Số: ${input.docNo}`, { x: margins.left, width: leftW, font: "regular", sizePt: HEADER_SIZE_PT - 1, align: "center" });
  }
  const leftBottom = b.y;

  // Cột phải: Quốc hiệu, tiêu ngữ (gạch chân), địa danh + ngày.
  b.y = startY;
  if (header.show_national_motto !== false) {
    placeSimpleText(b, m, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { x: rightX, width: rightW, font: "bold", sizePt: HEADER_SIZE_PT, align: "center" });
    const motto = placeSimpleText(b, m, "Độc lập - Tự do - Hạnh phúc", { x: rightX, width: rightW, font: "bold", sizePt: MOTTO_SIZE_PT, align: "center" });
    const lineY = b.y + 0.3;
    const x1 = rightX + (rightW - motto.lastLineWidth) / 2;
    b.add({ kind: "line", x1, y1: lineY, x2: x1 + motto.lastLineWidth, y2: lineY, thickness: 0.25, color: TEXT_COLOR });
    b.y += 3;
  }
  placeSimpleText(b, m, input.placeDateText || "", { x: rightX, width: rightW, font: "italic", sizePt: MOTTO_SIZE_PT, align: "center" });

  b.y = Math.max(leftBottom, b.y) + 6;
}

function layoutBody(
  b: PageBuilder,
  m: Measurer,
  paragraphs: Paragraph[],
  x0: number,
  contentW: number,
  baseSize: number,
  factor: number,
  afterParagraph?: (p: Paragraph) => void,
) {
  const counters: number[] = [];
  let prevList: string | undefined;

  const measureParagraph = (p: Paragraph) => {
    const size = p.block.header ? HEADING_SIZES[p.block.header] : baseSize;
    const lh = lineHeightMm(size, factor);
    const indentLevel = p.block.indent || 0;
    const listIndent = p.block.list ? LIST_INDENT_MM * (indentLevel + 1) : BLOCK_INDENT_MM * indentLevel;
    const runs = p.runs.map((r) => ({
      text: r.text,
      style: {
        font: styleKey(!!p.block.header || !!r.attrs?.bold, !!r.attrs?.italic),
        sizePt: size,
        color: r.placeholder ? "#b91c1c" : r.attrs?.color || TEXT_COLOR,
        underline: !!r.attrs?.underline,
        placeholder: !!r.placeholder,
      } as RunStyle,
    }));
    const avail = contentW - listIndent;
    const lines = breakLines(toPieces(runs, m), avail, m);
    const empty = runs.every((r) => !r.text.trim());
    return { size, lh, listIndent, indentLevel, avail, lines: empty ? [] : lines };
  };

  const measured = paragraphs.map(measureParagraph);
  const spacing = (lh: number) => lh * 0.25;

  measured.forEach((mp, i) => {
    const p = paragraphs[i];
    const lineCount = Math.max(mp.lines.length, 1);

    // Tiêu đề không đứng một mình cuối trang: cần đủ chỗ cho cả tiêu đề và
    // dòng đầu của đoạn tiếp theo.
    if (p.block.header) {
      const next = measured[i + 1];
      b.ensure(lineCount * mp.lh + (next ? spacing(mp.lh) + next.lh : 0));
    }

    // Đánh số danh sách có thứ tự, đặt lại khi hết khối danh sách.
    let marker = "";
    if (p.block.list) {
      const level = mp.indentLevel;
      if (prevList !== p.block.list) counters.length = 0;
      counters.length = level + 1;
      counters[level] = (counters[level] || 0) + 1;
      marker = p.block.list === "bullet" ? "•" : level === 0 ? `${counters[level]}.` : `${String.fromCharCode(96 + ((counters[level] - 1) % 26) + 1)}.`;
    } else {
      counters.length = 0;
    }
    prevList = p.block.list;

    if (!mp.lines.length) {
      b.ensure(mp.lh);
      b.y += mp.lh;
    }

    mp.lines.forEach((line, li) => {
      b.ensure(mp.lh);
      const baseline = b.y + m.baseline("regular", mp.size, mp.lh);
      if (li === 0 && marker) {
        const markerX = x0 + mp.listIndent - LIST_INDENT_MM;
        b.add({
          kind: "text",
          x: markerX,
          y: baseline,
          text: marker,
          font: "regular",
          sizePt: mp.size,
          color: TEXT_COLOR,
          width: m.width(marker, "regular", mp.size),
        });
      }
      const isLast = li === mp.lines.length - 1;
      emitLine(b, line, x0 + mp.listIndent, mp.avail, p.block.align, p.block.align === "justify" && !isLast, baseline);
      b.y += mp.lh;
    });

    b.y += spacing(mp.lh);
    if (p.anchors.length) afterParagraph?.(p);
  });
}

function slotX(slot: SlotConfig, colX: number, colW: number): number {
  const w = slot.box.w_mm;
  const off = slot.box.offset_x_mm || 0;
  let x = colX + (colW - w) / 2;
  if (slot.align === "left") x = colX;
  else if (slot.align === "right") x = colX + colW - w;
  return Math.min(Math.max(x + off, colX), colX + colW - Math.min(w, colW));
}

/** Vùng dành cho ảnh chữ ký trong khung (trừ dải tên/giờ ký). */
export function slotImageArea(slot: Pick<SlotConfig, "show_name" | "show_signed_at">, box: { x: number; y: number; w: number; h: number }) {
  const nameBand = slot.show_name ? SLOT_NAME_BAND_MM : 0;
  const timeBand = slot.show_signed_at ? SLOT_TIME_BAND_MM : 0;
  return {
    x: box.x + SLOT_PADDING_MM,
    y: box.y + SLOT_PADDING_MM,
    w: Math.max(box.w - 2 * SLOT_PADDING_MM, 0),
    h: Math.max(box.h - 2 * SLOT_PADDING_MM - nameBand - timeBand, 0),
  };
}

function layoutSignatureZone(
  b: PageBuilder,
  m: Measurer,
  input: LayoutInput,
  layout: Required<TemplateLayout>,
  x0: number,
  contentW: number,
  slotBoxes: Record<string, SlotBox>,
) {
  const slots = layout.slots || [];
  if (!slots.length) return;
  const zone = layout.signature_zone || {};
  const illustrativeSlot = (slot: SlotConfig) => layout.illustrative_label !== false && slot.role === "recipient";
  const colW = contentW / 2;
  const colX = (c: SlotConfig["column"]) => (c === "right" ? x0 + colW : x0);

  const columnHeight = (slot: SlotConfig) =>
    measureSimpleHeight(m, slot.heading || "", colW, "bold", SLOT_HEADING_SIZE_PT) +
    measureSimpleHeight(m, slot.hint || "", colW, "italic", SLOT_HINT_SIZE_PT) +
    2 +
    Math.max(0, slot.box.offset_y_mm || 0) +
    slot.box.h_mm +
    (illustrativeSlot(slot) ? ILLUSTRATIVE_BAND_MM : 0);

  const zoneHeight = (zone.gap_top_mm ?? 8) + Math.max(...slots.map(columnHeight));
  if (zone.keep_together !== false) b.ensure(zoneHeight);
  b.y += zone.gap_top_mm ?? 8;
  const top = b.y;
  let bottom = top;

  for (const slot of slots) {
    b.y = top;
    const cx = colX(slot.column);
    placeSimpleText(b, m, slot.heading || "", { x: cx, width: colW, font: "bold", sizePt: SLOT_HEADING_SIZE_PT, align: "center" });
    placeSimpleText(b, m, slot.hint || "", { x: cx, width: colW, font: "italic", sizePt: SLOT_HINT_SIZE_PT, align: "center", color: MUTED_COLOR });
    b.y += 2 + (slot.box.offset_y_mm || 0);

    const box = { x: slotX(slot, cx, colW), y: b.y, w: Math.min(slot.box.w_mm, colW), h: slot.box.h_mm };
    const imageArea = slotImageArea(slot, box);
    b.add({ kind: "slot", slotId: slot.id, role: slot.role, ...box, imageArea });
    slotBoxes[slot.id] = { page: b.page.index, x_mm: box.x, y_mm: box.y, w_mm: box.w, h_mm: box.h };

    // Ảnh bên phát hành (chèn tự động lúc phát hành - quyết định D1).
    const issuer = input.letterhead?.issuer;
    if (slot.role === "issuer" && issuer) {
      if (issuer.signature_url) {
        b.add({ kind: "image", role: "issuer_signature", src: issuer.signature_url, ...imageArea });
      }
      if (issuer.seal_url) {
        // Con dấu hình tròn, đè lệch trái lên chữ ký như văn bản giấy.
        const size = Math.min(imageArea.h + 4, imageArea.w * 0.6);
        b.add({ kind: "image", role: "seal", src: issuer.seal_url, x: imageArea.x, y: imageArea.y + (imageArea.h - size) / 2, w: size, h: size });
      }
    }

    // Dải tên + giờ ký ở đáy khung.
    const fill = input.slotFills?.[slot.id] || {};
    const name = slot.role === "issuer" ? fill.name ?? issuer?.name : fill.name;
    let bandTop = imageArea.y + imageArea.h;
    if (slot.show_name && name) {
      const lh = SLOT_NAME_BAND_MM;
      const text = fitText(m, name, box.w - 2 * SLOT_PADDING_MM, "bold", SLOT_NAME_SIZE_PT);
      emitLine(b, singleLine(m, text, "bold", SLOT_NAME_SIZE_PT), box.x + SLOT_PADDING_MM, box.w - 2 * SLOT_PADDING_MM, "center", false, bandTop + m.baseline("bold", SLOT_NAME_SIZE_PT, lh));
    }
    if (slot.show_name) bandTop += SLOT_NAME_BAND_MM;
    if (slot.show_signed_at && fill.signedAtText) {
      const text = fitText(m, fill.signedAtText, box.w - 2 * SLOT_PADDING_MM, "regular", SLOT_TIME_SIZE_PT);
      emitLine(b, singleLine(m, text, "regular", SLOT_TIME_SIZE_PT, MUTED_COLOR), box.x + SLOT_PADDING_MM, box.w - 2 * SLOT_PADDING_MM, "center", false, bandTop + m.baseline("regular", SLOT_TIME_SIZE_PT, SLOT_TIME_BAND_MM));
    }
    if (illustrativeSlot(slot)) {
      const text = fitText(m, ILLUSTRATIVE_TEXT, box.w, "italic", ILLUSTRATIVE_SIZE_PT);
      emitLine(b, singleLine(m, text, "italic", ILLUSTRATIVE_SIZE_PT, MUTED_COLOR), box.x, box.w, "center", false, box.y + box.h + m.baseline("italic", ILLUSTRATIVE_SIZE_PT, ILLUSTRATIVE_BAND_MM));
    }
    bottom = Math.max(bottom, box.y + box.h + (illustrativeSlot(slot) ? ILLUSTRATIVE_BAND_MM : 0));
  }

  // Tên + chức vụ bên phát hành dưới khung (nếu có).
  b.y = bottom;
  const issuerSlot = slots.find((s) => s.role === "issuer");
  const issuerTitle = input.letterhead?.issuer?.title;
  if (issuerSlot && issuerTitle) {
    b.y += 1;
    placeSimpleText(b, m, issuerTitle, { x: colX(issuerSlot.column), width: colW, font: "italic", sizePt: SLOT_HINT_SIZE_PT, align: "center", color: MUTED_COLOR });
  }
}

function singleLine(m: Measurer, text: string, font: FontStyleKey, sizePt: number, color = TEXT_COLOR): Line {
  const width = m.width(text, font, sizePt);
  return { pieces: [{ text, font, sizePt, color, underline: false, placeholder: false, space: false, width }], width };
}

/** Cắt chuỗi và thêm "…" cho vừa độ rộng. */
function fitText(m: Measurer, text: string, width: number, font: FontStyleKey, sizePt: number): string {
  if (m.width(text, font, sizePt) <= width + EPS) return text;
  const chars = [...text];
  while (chars.length && m.width(`${chars.join("")}…`, font, sizePt) > width + EPS) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

function layoutFooters(pages: PageLayout[], m: Measurer, input: LayoutInput, margins: { left: number; right: number }, illustrative = false) {
  const footer = input.letterhead?.footer || {};
  const lines = (input.footerLines ?? footer.lines ?? []).filter((l) => l && l.trim());
  if (illustrative) lines.push(ILLUSTRATIVE_FOOTER);
  const qr = footer.show_qr && input.verifyUrl;
  const contentW = PAGE_WIDTH_MM - margins.left - margins.right;
  const textW = qr ? contentW - QR_SIZE_MM - 3 : contentW;
  const lh = lineHeightMm(FOOTER_SIZE_PT, 1.3);

  for (const page of pages) {
    const top = PAGE_HEIGHT_MM - FOOTER_TOP_FROM_BOTTOM_MM;
    page.items.push({ kind: "line", x1: margins.left, y1: top - 1.5, x2: PAGE_WIDTH_MM - margins.right, y2: top - 1.5, thickness: 0.2, color: MUTED_COLOR });

    const meta: string[] = [];
    if (input.docNo) meta.push(`Mã VB: ${input.docNo}`);
    if (footer.show_page_number !== false) meta.push(`Trang ${page.index + 1}/${pages.length}`);
    if (footer.show_hash && input.hashShort) meta.push(`SHA-256: ${input.hashShort}`);

    const b = new PageBuilder(top, PAGE_HEIGHT_MM);
    b.pages = [page];
    b.y = top;
    for (const text of [...lines, meta.join(" · ")]) {
      if (!text) continue;
      const fitted = fitText(m, text, textW, "regular", FOOTER_SIZE_PT);
      emitLine(b, singleLine(m, fitted, "regular", FOOTER_SIZE_PT, MUTED_COLOR), margins.left, textW, "left", false, b.y + m.baseline("regular", FOOTER_SIZE_PT, lh));
      b.y += lh;
    }
    if (qr) {
      page.items.push({ kind: "qr", x: PAGE_WIDTH_MM - margins.right - QR_SIZE_MM, y: top, size: QR_SIZE_MM, value: input.verifyUrl as string });
    }
  }
}

// ─── Trường người nhận điền (chữ ký, ký nháy, ngày, ô xác nhận, ô nhập) ──

export const ILLUSTRATIVE_TEXT = "Chữ ký minh hoạ";
export const ILLUSTRATIVE_FOOTER = "Chữ ký trên văn bản này mang tính minh hoạ.";
const ILLUSTRATIVE_BAND_MM = 3.5;
const ILLUSTRATIVE_SIZE_PT = 7;
const FIELD_LABEL_BAND_MM = 4.5;
const FIELD_LABEL_SIZE_PT = 9;
const FIELD_VALUE_SIZE_PT = 10.5;
const CHECKBOX_LABEL_SIZE_PT = 10.5;
export const MAX_FIELDS = 30;

/** Kích thước mặc định và giới hạn (mm) theo loại trường. */
export const FIELD_SIZE_LIMITS: Record<FieldType, { def: [number, number]; min: [number, number]; max: [number, number] }> = {
  signature: { def: [60, 25], min: [30, 12], max: [90, 45] },
  initials: { def: [22, 12], min: [12, 8], max: [45, 25] },
  date: { def: [35, 7], min: [20, 5], max: [70, 12] },
  checkbox: { def: [5, 5], min: [4, 4], max: [8, 8] },
  text: { def: [70, 7], min: [20, 5], max: [170, 15] },
};

const FIELD_TYPES: FieldType[] = ["signature", "initials", "date", "checkbox", "text"];
const clampNum = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : fallback;
};

/** Chuẩn hoá danh sách trường: mã hợp lệ, không trùng, kích thước trong giới hạn. */
export function normalizeFields(fields: FieldConfig[] | null | undefined): FieldConfig[] {
  const out: FieldConfig[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(fields) ? fields : []) {
    if (out.length >= MAX_FIELDS) break;
    const id = normalizeFieldId(raw?.id || "");
    const type = raw?.type as FieldType;
    if (!id || seen.has(id) || !FIELD_TYPES.includes(type)) continue;
    seen.add(id);
    const lim = FIELD_SIZE_LIMITS[type];
    let w = clampNum(raw.size_mm?.w, lim.min[0], lim.max[0], lim.def[0]);
    let h = clampNum(raw.size_mm?.h, lim.min[1], lim.max[1], lim.def[1]);
    if (type === "checkbox") w = h = Math.min(w, h);
    const footer = raw.anchor?.kind === "every_page_footer" && type === "initials";
    const anchor: FieldAnchor = footer
      ? {
          kind: "every_page_footer",
          align: (raw.anchor as { align?: string }).align === "left" ? "left" : "right",
          pages: (raw.anchor as { pages?: string }).pages === "all" ? "all" : "all_but_last",
        }
      : { kind: "flow" };
    const field: FieldConfig = {
      id,
      type,
      label: String(raw.label || "").slice(0, 160),
      required: raw.required !== false,
      size_mm: { w, h },
      anchor,
      offset_mm: { x: clampNum(raw.offset_mm?.x, 0, 170, 0), y: clampNum(raw.offset_mm?.y, 0, 30, 0) },
    };
    const options: NonNullable<FieldConfig["options"]> = {};
    if (type === "checkbox" && raw.options?.must_be_checked) options.must_be_checked = true;
    if (type === "text") {
      options.max_length = clampNum(raw.options?.max_length, 1, 200, 200);
      if (raw.options?.placeholder) options.placeholder = String(raw.options.placeholder).slice(0, 80);
    }
    if (Object.keys(options).length) field.options = options;
    out.push(field);
  }
  return out;
}

function hasIllustrativeBand(layout: Required<TemplateLayout>, type: FieldType): boolean {
  return layout.illustrative_label !== false && (type === "signature" || type === "initials");
}

function addRectLines(b: PageBuilder, x: number, y: number, w: number, h: number, thickness: number, color: string) {
  b.add({ kind: "line", x1: x, y1: y, x2: x + w, y2: y, thickness, color });
  b.add({ kind: "line", x1: x + w, y1: y, x2: x + w, y2: y + h, thickness, color });
  b.add({ kind: "line", x1: x + w, y1: y + h, x2: x, y2: y + h, thickness, color });
  b.add({ kind: "line", x1: x, y1: y + h, x2: x, y2: y, thickness, color });
}

/** Vẽ khung trường + giá trị dạng chữ/ô tick (ảnh chữ ký do renderer vẽ). */
function emitField(
  b: PageBuilder,
  m: Measurer,
  field: FieldConfig,
  occurrence: number,
  box: { x: number; y: number; w: number; h: number },
  fill: FieldFill | undefined,
  illustrative: boolean,
  fieldBoxes: Record<string, SlotBox[]>,
) {
  const inset = field.type === "checkbox" ? 0 : 1;
  b.add({
    kind: "field",
    fieldId: field.id,
    type: field.type,
    occurrence,
    required: field.required !== false,
    ...box,
    imageArea: { x: box.x + inset, y: box.y + inset, w: Math.max(box.w - 2 * inset, 0), h: Math.max(box.h - 2 * inset, 0) },
  });
  (fieldBoxes[field.id] ||= []).push({ page: b.page.index, x_mm: box.x, y_mm: box.y, w_mm: box.w, h_mm: box.h });

  if (field.type === "checkbox") {
    addRectLines(b, box.x, box.y, box.w, box.h, 0.3, TEXT_COLOR);
    if (fill?.checked) {
      const t = 0.45;
      b.add({ kind: "line", x1: box.x + box.w * 0.2, y1: box.y + box.h * 0.55, x2: box.x + box.w * 0.42, y2: box.y + box.h * 0.78, thickness: t, color: TEXT_COLOR });
      b.add({ kind: "line", x1: box.x + box.w * 0.42, y1: box.y + box.h * 0.78, x2: box.x + box.w * 0.82, y2: box.y + box.h * 0.22, thickness: t, color: TEXT_COLOR });
    }
  } else if (field.type === "date" || field.type === "text") {
    b.add({ kind: "line", x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y + box.h, thickness: 0.2, color: MUTED_COLOR });
    if (fill?.text) {
      const text = fitText(m, fill.text, box.w - 1, "regular", FIELD_VALUE_SIZE_PT);
      emitLine(b, singleLine(m, text, "regular", FIELD_VALUE_SIZE_PT), box.x + 0.5, box.w - 1, "left", false, box.y + m.baseline("regular", FIELD_VALUE_SIZE_PT, box.h));
    }
  }

  if (illustrative) {
    const text = fitText(m, ILLUSTRATIVE_TEXT, Math.max(box.w, 30), "italic", ILLUSTRATIVE_SIZE_PT);
    const cx = box.x + box.w / 2;
    const w = Math.max(box.w, 30);
    emitLine(b, singleLine(m, text, "italic", ILLUSTRATIVE_SIZE_PT, MUTED_COLOR), cx - w / 2, w, "center", false, box.y + box.h + m.baseline("italic", ILLUSTRATIVE_SIZE_PT, ILLUSTRATIVE_BAND_MM));
  }
}

/** Đặt 1 trường "flow" ở vị trí hiện tại của luồng chữ (ngay sau đoạn neo). */
function placeFlowField(
  b: PageBuilder,
  m: Measurer,
  field: FieldConfig,
  layout: Required<TemplateLayout>,
  x0: number,
  contentW: number,
  fills: Record<string, FieldFill> | undefined,
  fieldBoxes: Record<string, SlotBox[]>,
) {
  const { w, h } = field.size_mm;
  const offX = Math.min(field.offset_mm?.x || 0, Math.max(contentW - w, 0));
  const offY = field.offset_mm?.y || 0;
  const x = x0 + offX;
  const illustrative = hasIllustrativeBand(layout, field.type);
  const labelText = (field.label || "").trim();

  if (field.type === "checkbox") {
    const labelX = x + w + 2;
    const labelW = Math.max(x0 + contentW - labelX, 20);
    const labelH = labelText ? measureSimpleHeight(m, labelText, labelW, "regular", CHECKBOX_LABEL_SIZE_PT) : 0;
    const height = offY + Math.max(h, labelH);
    b.ensure(height + 1);
    const top = b.y + offY;
    const lh = lineHeightMm(CHECKBOX_LABEL_SIZE_PT, 1.3);
    const boxY = top + Math.max((lh - h) / 2, 0);
    emitField(b, m, field, 0, { x, y: boxY, w, h }, fills?.[field.id], false, fieldBoxes);
    if (labelText) {
      b.y = top;
      placeSimpleText(b, m, labelText, { x: labelX, width: labelW, font: "regular", sizePt: CHECKBOX_LABEL_SIZE_PT });
    }
    b.y = top + Math.max(h, labelH) + 1.5;
    return;
  }

  const labelBand = labelText ? FIELD_LABEL_BAND_MM : 0;
  const height = offY + labelBand + h + (illustrative ? ILLUSTRATIVE_BAND_MM : 0);
  b.ensure(height + 1);
  const top = b.y + offY;
  if (labelText) {
    const labelW = Math.max(x0 + contentW - x, 20);
    const text = fitText(m, labelText, labelW, "italic", FIELD_LABEL_SIZE_PT);
    emitLine(b, singleLine(m, text, "italic", FIELD_LABEL_SIZE_PT, MUTED_COLOR), x, labelW, "left", false, top + m.baseline("italic", FIELD_LABEL_SIZE_PT, FIELD_LABEL_BAND_MM));
  }
  emitField(b, m, field, 0, { x, y: top + labelBand, w, h }, fills?.[field.id], illustrative, fieldBoxes);
  b.y = top + labelBand + h + (illustrative ? ILLUSTRATIVE_BAND_MM : 0) + 1.5;
}

/** Khoảng (mm) dành ở đáy mỗi trang cho các trường lặp ở chân trang. */
function footerFieldReserve(fields: FieldConfig[], layout: Required<TemplateLayout>): number {
  let reserve = 0;
  for (const f of fields) {
    if (f.anchor?.kind !== "every_page_footer") continue;
    reserve = Math.max(reserve, f.size_mm.h + (hasIllustrativeBand(layout, f.type) ? ILLUSTRATIVE_BAND_MM : 0) + 2);
  }
  return reserve;
}

function placeFooterFields(
  b: PageBuilder,
  m: Measurer,
  fields: FieldConfig[],
  layout: Required<TemplateLayout>,
  margins: { left: number; right: number },
  bodyBottom: number,
  fills: Record<string, FieldFill> | undefined,
  fieldBoxes: Record<string, SlotBox[]>,
) {
  const footerFields = fields.filter((f) => f.anchor?.kind === "every_page_footer");
  if (!footerFields.length) return;
  const pages = b.pages;
  for (const page of pages) {
    let right = PAGE_WIDTH_MM - margins.right;
    let left = margins.left;
    for (const field of footerFields) {
      const anchor = field.anchor as Extract<FieldAnchor, { kind: "every_page_footer" }>;
      if (anchor.pages !== "all" && pages.length > 1 && page.index === pages.length - 1) continue;
      if (anchor.pages !== "all" && pages.length === 1) continue;
      const { w, h } = field.size_mm;
      let x: number;
      if (anchor.align === "left") {
        x = left;
        left += w + 4;
      } else {
        x = right - w;
        right -= w + 4;
      }
      const pb = new PageBuilder(0, PAGE_HEIGHT_MM);
      pb.pages = [page];
      emitField(pb, m, field, page.index, { x, y: bodyBottom + 1, w, h }, fills?.[field.id], hasIllustrativeBand(layout, field.type), fieldBoxes);
    }
  }
}

/** Bố cục đầy đủ: phần thiếu lấy theo DEFAULT_LAYOUT (spec 4.3.1). */
export function normalizeLayout(layout: TemplateLayout | null | undefined): Required<TemplateLayout> {
  return {
    ...DEFAULT_LAYOUT,
    ...(layout || {}),
    page: { ...DEFAULT_LAYOUT.page, ...(layout?.page || {}) },
    signature_zone: { ...DEFAULT_LAYOUT.signature_zone, ...(layout?.signature_zone || {}) },
    slots: layout?.slots?.length ? layout.slots : DEFAULT_LAYOUT.slots,
    fields: normalizeFields(layout?.fields),
    illustrative_label: layout?.illustrative_label === true,
  };
}

/** Dàn trang toàn bộ văn bản. Hàm thuần: cùng đầu vào luôn cho cùng kết quả. */
export function layoutDocument(input: LayoutInput): LayoutResult {
  const fonts = input.fonts || NOTO_SERIF;
  const m = new Measurer(fonts);
  const theme = { ...DEFAULT_THEME, ...(input.letterhead?.theme || {}) };
  const margins = { ...DEFAULT_THEME.margins_mm, ...(input.letterhead?.theme?.margins_mm || {}) };
  const layout = normalizeLayout(input.layout);
  const baseSize = Number(theme.font_size_pt) || DEFAULT_THEME.font_size_pt;
  const factor = Number(theme.line_height) || DEFAULT_THEME.line_height;
  const x0 = margins.left;
  const contentW = PAGE_WIDTH_MM - margins.left - margins.right;
  const fields = layout.fields;
  const bodyBottom = PAGE_HEIGHT_MM - margins.bottom - footerFieldReserve(fields, layout);

  const b = new PageBuilder(margins.top, bodyBottom);
  layoutHeader(b, m, input, margins);

  if (input.title) {
    placeSimpleText(b, m, input.title.toUpperCase(), { x: x0, width: contentW, font: "bold", sizePt: TITLE_SIZE_PT, align: "center" });
    b.y += 5;
  }

  const fieldBoxes: Record<string, SlotBox[]> = {};
  const flowFields = new Map(fields.filter((f) => f.anchor?.kind !== "every_page_footer").map((f) => [f.id, f]));
  const placed = new Set<string>();
  const placeFlow = (id: string) => {
    const field = flowFields.get(id);
    if (!field || placed.has(id)) return;
    placed.add(id);
    placeFlowField(b, m, field, layout, x0, contentW, input.fieldFills, fieldBoxes);
  };

  layoutBody(b, m, toParagraphs(input.body), x0, contentW, baseSize, factor, (p) => p.anchors.forEach(placeFlow));
  // Trường chưa có điểm neo trong thân: đặt ngay sau thân văn bản.
  for (const id of flowFields.keys()) placeFlow(id);

  const slotBoxes: Record<string, SlotBox> = {};
  layoutSignatureZone(b, m, input, layout, x0, contentW, slotBoxes);
  placeFooterFields(b, m, fields, layout, margins, bodyBottom, input.fieldFills, fieldBoxes);
  layoutFooters(b.pages, m, input, margins, layout.illustrative_label !== false);

  return {
    pages: b.pages,
    slotBoxes,
    fieldBoxes,
    pageCount: b.pages.length,
    exceedsMaxPages: b.pages.length > MAX_PAGES,
    unsupportedChars: [...m.unsupported],
  };
}

/**
 * Đặt ảnh chữ ký (w×h px) vào vùng ảnh của khung ký: giữ tỉ lệ, căn giữa
 * ngang, bám đáy vùng ảnh để chữ ký "ngồi" trên dòng tên (spec 7.4).
 */
export function placeSignatureImage(
  area: { x: number; y: number; w: number; h: number },
  imageWidthPx: number,
  imageHeightPx: number,
): { x: number; y: number; w: number; h: number } {
  if (!(imageWidthPx > 0) || !(imageHeightPx > 0) || area.w <= 0 || area.h <= 0) {
    return { x: area.x, y: area.y, w: 0, h: 0 };
  }
  const scale = Math.min(area.w / imageWidthPx, area.h / imageHeightPx);
  const w = imageWidthPx * scale;
  const h = imageHeightPx * scale;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h), w, h };
}
