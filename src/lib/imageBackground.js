/**
 * Xoá nền sáng của ảnh chữ ký/con dấu (spec 6.1, 7.3): pixel có độ sáng lớn
 * hơn ngưỡng thành trong suốt, rồi cắt bỏ viền trong suốt thừa. Hàm thuần trên
 * mảng RGBA để test được ngoài trình duyệt; phần đọc/ghi canvas ở
 * removeBackgroundFromFile() bên dưới.
 */

/** Độ sáng cảm nhận (0-255) theo hệ số Rec. 601. */
export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Làm trong suốt pixel sáng hơn `threshold`. Vùng chuyển tiếp mềm
 * `feather` giữ mép nét mượt thay vì răng cưa. Sửa trực tiếp `data`.
 */
export function makeLightPixelsTransparent(data, threshold = 200, feather = 24) {
  const lo = Math.max(0, threshold - feather);
  for (let i = 0; i < data.length; i += 4) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    if (lum >= threshold) {
      data[i + 3] = 0;
    } else if (lum > lo) {
      data[i + 3] = Math.round(data[i + 3] * ((threshold - lum) / (threshold - lo)));
    }
  }
  return data;
}

/** Khung bao nhỏ nhất chứa pixel có alpha > minAlpha; null nếu ảnh trống. */
export function opaqueBounds(data, width, height, minAlpha = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > minAlpha) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh"));
    };
    img.src = url;
  });
}

/**
 * Đọc file ảnh, (tuỳ chọn) xoá nền sáng, cắt viền trong suốt, thu nhỏ trong
 * giới hạn maxWidth×maxHeight và trả về PNG Blob + kích thước.
 */
export async function removeBackgroundFromFile(file, { threshold = 200, removeBackground = true, maxWidth = 1200, maxHeight = 1200 } = {}) {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (removeBackground) makeLightPixelsTransparent(imageData.data, threshold);
  const bounds = opaqueBounds(imageData.data, canvas.width, canvas.height);
  if (!bounds) throw new Error("Ảnh không có nội dung sau khi xoá nền - thử giảm ngưỡng");
  ctx.putImageData(imageData, 0, 0);

  const scale = Math.min(1, maxWidth / bounds.width, maxHeight / bounds.height);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(bounds.width * scale));
  out.height = Math.max(1, Math.round(bounds.height * scale));
  out.getContext("2d").drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, out.width, out.height);
  const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Không tạo được ảnh PNG");
  return { blob, width: out.width, height: out.height };
}
