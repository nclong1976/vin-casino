#!/usr/bin/env node
/**
 * Sinh bảng độ rộng glyph cho bộ dàn trang văn bản (spec mục 3.4).
 *
 *   node scripts/build-font-metrics.mjs
 *
 * Đọc 4 file Noto Serif trong public/fonts/noto-serif/ và ghi
 * src/shared/docLayout/fonts/notoSerifMetrics.ts. Trình duyệt và Edge
 * Function đo chữ bằng CÙNG bảng này (không đo bằng DOM), nên xuống dòng và
 * ngắt trang trên màn hình khớp với PDF. Chạy lại script khi đổi file font.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = path.join(root, "public/fonts/noto-serif");
const outFile = path.join(root, "src/shared/docLayout/fonts/notoSerifMetrics.ts");

const STYLES = {
  regular: "NotoSerif-Regular.ttf",
  bold: "NotoSerif-Bold.ttf",
  italic: "NotoSerif-Italic.ttf",
  boldItalic: "NotoSerif-BoldItalic.ttf",
};

// Bảng ký tự cần đo: ASCII in được, Latin-1, chữ Việt dựng sẵn (NFC) và
// dấu câu thường gặp trong văn bản hành chính.
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x100, 0x17f], // Latin Extended-A (Ă ă Đ đ Ĩ ĩ Ũ ũ ...)
  [0x1a0, 0x1b0], // Ơ ơ Ư ư
  [0x1ea0, 0x1ef9], // Latin Extended Additional - toàn bộ chữ Việt có dấu thanh
];
const EXTRA = [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ab, 0x2116, 0x2122, 0x00b7];

function codepoints() {
  const list = [];
  for (const [a, b] of RANGES) for (let c = a; c <= b; c++) list.push(c);
  return [...new Set([...list, ...EXTRA])].sort((a, b) => a - b);
}

function measure(file) {
  const font = fontkit.openSync(path.join(fontDir, file));
  const widths = {};
  const missing = [];
  for (const cp of codepoints()) {
    if (!font.hasGlyphForCodePoint(cp)) {
      missing.push(cp);
      continue;
    }
    widths[cp] = font.glyphForCodePoint(cp).advanceWidth;
  }
  return {
    metrics: {
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascent,
      descender: font.descent,
      lineGap: font.lineGap,
      capHeight: font.capHeight,
      underlinePosition: font.underlinePosition,
      underlineThickness: font.underlineThickness,
      fallbackWidth: font.glyphForCodePoint(0x3f).advanceWidth, // "?"
      widths,
    },
    missing,
  };
}

const result = {};
for (const [style, file] of Object.entries(STYLES)) {
  const { metrics, missing } = measure(file);
  result[style] = metrics;
  const shown = missing.filter((cp) => cp > 0xff).map((cp) => `U+${cp.toString(16).toUpperCase()}`);
  console.log(`${style}: ${Object.keys(metrics.widths).length} glyphs${shown.length ? `, missing ${shown.join(" ")}` : ""}`);
}

const header = `/**
 * FILE SINH TỰ ĐỘNG bởi scripts/build-font-metrics.mjs - không sửa tay.
 * Độ rộng glyph (đơn vị font, unitsPerEm) của Noto Serif - SIL Open Font
 * License 1.1, xem public/fonts/noto-serif/OFL.txt.
 */

import type { FontMetrics } from "../metrics";

`;
const body = Object.entries(result)
  .map(([style, m]) => `export const ${style}: FontMetrics = ${JSON.stringify(m)};\n`)
  .join("\n");

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, header + body);
console.log(`wrote ${path.relative(root, outFile)} (${fs.statSync(outFile).size} bytes)`);
