/**
 * Mã QR ở footer (dẫn tới trang /verify). Trả về các dải ô tối theo hàng để
 * cả SVG lẫn pdf-lib chỉ cần vẽ vài chục hình chữ nhật thay vì từng ô.
 */

import qrcode from "qrcode-generator";

export interface QrRects {
  /** Số ô mỗi cạnh (chưa gồm viền trắng). */
  moduleCount: number;
  /** Mỗi dải: hàng y, cột bắt đầu x, độ dài w (đơn vị: ô). */
  rects: { x: number; y: number; w: number }[];
}

export function qrRects(value: string): QrRects {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const rects: QrRects["rects"] = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && qr.isDark(row, col)) col++;
      rects.push({ x: start, y: row, w: col - start });
    }
  }
  return { moduleCount: n, rects };
}
