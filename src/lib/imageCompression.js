/**
 * Nén ảnh phía client trước khi "upload" - base44.integrations.Core.
 * UploadFile (base44Client.js) chỉ đọc file thành base64 data URL rồi lưu
 * thẳng vào cột attachments (KHÔNG có S3/CDN thật), nên giảm dung lượng ảnh
 * ở đây giảm trực tiếp dung lượng ghi vào Postgres/localStorage - vá đúng
 * rủi ro đã biết ("ảnh base64 dung lượng lớn có thể vượt hạn mức
 * localStorage", xem comment ở setLocalStore()).
 *
 * CHỈ áp dụng cho ảnh - video giữ nguyên (nén video client-side cần thư
 * viện nặng như ffmpeg.wasm, không hợp lý cho 1 tính năng phụ ở CSKH).
 */
export async function compressImageFile(file, { maxDimension = 1600, quality = 0.75 } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  // SVG (vector) và GIF (có thể hoạt hình nhiều khung hình) vẽ lại qua canvas
  // sẽ mất đặc tính gốc - giữ nguyên, không nén.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Nén không hiệu quả (ảnh vốn đã nhỏ/đã nén sẵn) - giữ bản gốc thay vì
    // ép dùng bản "nén" mà thực ra nặng hơn.
    if (!blob || blob.size >= file.size) return file;

    const baseName = (file.name || "image").replace(/\.\w+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch (e) {
    // Trình duyệt không hỗ trợ createImageBitmap/canvas, hoặc ảnh lỗi decode
    // - lùi về gửi file gốc, không chặn người dùng gửi tin.
    return file;
  }
}
