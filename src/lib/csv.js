/**
 * Tiện ích CSV nhỏ cho màn Admin (không phụ thuộc thư viện ngoài).
 */

/** Tách 1 dòng CSV theo dấu phẩy, tôn trọng ô trong ngoặc kép ("a, b"). */
export function splitCsvLine(line, delimiter = ",") {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectDelimiter(firstLine) {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Bảng CSV → mảng dòng (mảng ô). Bỏ BOM và dòng trống. */
export function parseCsv(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  return lines.map((l) => splitCsvLine(l, delimiter));
}

/** Cột đầu tiên (email / mã hội viên / SĐT / user id), bỏ dòng tiêu đề, không trùng. */
export function parseIdentifierCsv(text) {
  const rows = parseCsv(text).map((r) => r[0]).filter(Boolean);
  if (rows.length && /^(email|e-mail|user_id|id|identifier|mã|ma|phone|sđt|sdt)/i.test(rows[0])) rows.shift();
  return [...new Set(rows)];
}

/** Ô CSV an toàn: bọc ngoặc kép khi cần, chặn công thức Excel (=,+,-,@). */
export function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Mảng dòng → chuỗi CSV (có BOM để Excel đọc đúng tiếng Việt). */
export function toCsv(rows) {
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;
}
