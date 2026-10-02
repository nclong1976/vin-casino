/**
 * Xuất CSV cho Admin. Có BOM UTF-8 để Excel đọc đúng tiếng Việt; trường chứa
 * dấu phẩy / ngoặc kép / xuống dòng được bọc ngoặc kép; giá trị bắt đầu bằng
 * = + - @ được thêm ' để tránh Excel hiểu là công thức (CSV injection).
 *
 * columns: [{ key, label, get? }]
 */
export function toCsv(rows, columns) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = (rows || []).map((r) => columns.map((c) => cell(c.get ? c.get(r) : r[c.key])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
