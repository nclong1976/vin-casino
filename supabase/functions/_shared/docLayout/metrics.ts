// FILE SINH TỰ ĐỘNG từ src/shared/docLayout bởi scripts/sync-shared.mjs - không sửa tay.
/**
 * Đo chữ bằng bảng độ rộng glyph sinh sẵn (spec mục 3.4) - không dùng DOM
 * hay canvas, để trình duyệt và Edge Function cho ra đúng cùng một số đo.
 * Không áp dụng kerning ở cả hai phía.
 */

import * as notoSerif from "./fonts/notoSerifMetrics.ts";

export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  capHeight: number;
  underlinePosition: number;
  underlineThickness: number;
  /** Độ rộng dùng cho ký tự không có trong bảng. */
  fallbackWidth: number;
  /** codepoint -> advance width (đơn vị font). */
  widths: Record<string, number>;
}

export type FontStyleKey = "regular" | "bold" | "italic" | "boldItalic";

export interface FontFamilyMetrics {
  name: string;
  styles: Record<FontStyleKey, FontMetrics>;
}

export const NOTO_SERIF: FontFamilyMetrics = {
  name: "Noto Serif",
  styles: {
    regular: notoSerif.regular,
    bold: notoSerif.bold,
    italic: notoSerif.italic,
    boldItalic: notoSerif.boldItalic,
  },
};

export const PT_PER_MM = 72 / 25.4;

export function styleKey(bold?: boolean, italic?: boolean): FontStyleKey {
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
}

/** Ký tự có glyph trong bảng đo hay không. */
export function isSupportedChar(metrics: FontMetrics, ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && metrics.widths[cp] !== undefined;
}

/** Độ rộng chuỗi theo mm ở cỡ chữ sizePt. */
export function measureTextMm(metrics: FontMetrics, text: string, sizePt: number): number {
  let units = 0;
  for (const ch of text) {
    const w = metrics.widths[ch.codePointAt(0) as number];
    units += w === undefined ? metrics.fallbackWidth : w;
  }
  return ((units / metrics.unitsPerEm) * sizePt) / PT_PER_MM;
}

/** Khoảng từ đỉnh dòng tới baseline, theo mm, với chiều cao dòng lineHeightMm. */
export function baselineOffsetMm(metrics: FontMetrics, sizePt: number, lineHeightMm: number): number {
  const ascentMm = ((metrics.ascender / metrics.unitsPerEm) * sizePt) / PT_PER_MM;
  const descentMm = ((-metrics.descender / metrics.unitsPerEm) * sizePt) / PT_PER_MM;
  // Chia đều phần dư của line-height lên trên/dưới - đúng cách CSS đặt chữ
  // trong một dòng, để vị trí baseline trên web và trong PDF trùng nhau.
  return (lineHeightMm - (ascentMm + descentMm)) / 2 + ascentMm;
}
