/**
 * Nén ảnh phía client trước khi "upload" - base44.integrations.Core.
 * UploadFile (base44Client.js) upload thật lên Supabase Storage (bucket
 * "chat-attachments") và trả về 1 URL công khai; chỉ khi upload đó THẤT BẠI
 * (mất mạng, lỗi Storage...) các nơi gọi (Support.jsx/MessagesTab.jsx) mới
 * lùi về FileReader.readAsDataURL(), ghi thẳng base64 vào cột "attachments"
 * - nhánh dự phòng này mới là nguồn phình bảng "messages" đã gặp thực tế
 * (base64 vài MB/dòng, xem migration fix_messages_timeout_and_index.sql).
 * Nén ở đây chủ yếu phục vụ "gửi/tải nhanh trên mạng di động" cho đường
 * upload thật, đồng thời vẫn là lưới an toàn cho nhánh dự phòng đó.
 *
 * CHỈ áp dụng cho ảnh - video giữ nguyên (nén video client-side cần thư
 * viện nặng như ffmpeg.wasm, không hợp lý cho 1 tính năng phụ ở CSKH).
 */
// Trần dung lượng SAU KHI nén - giữ 700KB làm ngân sách hợp lý cho tốc độ
// gửi/tải trên mạng di động. Mã hoá bằng WebP (xem encodeCanvas() bên dưới)
// thay vì JPEG như trước - hiệu quả hơn JPEG đáng kể ở cùng ngân sách này
// (ảnh NÉT HƠN rõ rệt ở cùng dung lượng), nên tăng được quality/kích thước
// khởi điểm mà đa số ảnh thật (chụp máy/chụp màn hình) vẫn lọt ngân sách.
const MAX_OUTPUT_BYTES = 700 * 1024;

// Thử mã hoá WebP trước - hầu hết trình duyệt hiện đại (Chrome/Edge/Firefox
// mọi nền tảng, Safari 14+/iOS 14+) hỗ trợ qua canvas.toBlob(). Trình duyệt
// cũ không hỗ trợ có thể trả về null HOẶC lặng lẽ trả PNG (rất nặng, không
// phải định dạng đã yêu cầu) thay vì báo lỗi rõ ràng - phải tự kiểm tra
// đúng blob.type trả về, lùi về JPEG (hỗ trợ phổ quát) nếu không phải WebP
// thật, không tin suông tham số mimeType đã truyền vào.
async function encodeCanvas(canvas, quality) {
  const webpBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (webpBlob && webpBlob.type === "image/webp") return webpBlob;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImageFile(file, { maxDimension = 1920, quality = 0.85 } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  // SVG (vector) và GIF (có thể hoạt hình nhiều khung hình) vẽ lại qua canvas
  // sẽ mất đặc tính gốc - giữ nguyên, không nén.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    let bestBlob = null;
    let dimension = maxDimension;

    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, width, height);

      // Hạ quality trước (rẻ hơn, ít mất chi tiết bố cục hơn hạ kích thước),
      // chỉ hạ thêm kích thước ở các lượt thử sau nếu hạ quality không đủ.
      const q = Math.max(0.4, quality - attempt * 0.12);
      const blob = await encodeCanvas(canvas, q);
      if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob;
      if (blob && blob.size <= MAX_OUTPUT_BYTES) break;
      dimension = Math.round(dimension * 0.75);
    }
    if (typeof bitmap.close === "function") bitmap.close();

    // Nén không hiệu quả (ảnh vốn đã nhỏ/đã nén sẵn) - giữ bản gốc thay vì
    // ép dùng bản "nén" mà thực ra nặng hơn. Nếu bản gốc CŨNG vượt trần thì
    // vẫn ưu tiên bản đã nén nhỏ nhất tìm được (dù có thể vẫn hơi lớn) thay
    // vì gửi thẳng bản gốc chưa qua xử lý gì.
    if (!bestBlob || (bestBlob.size >= file.size && file.size <= MAX_OUTPUT_BYTES)) return file;

    const ext = bestBlob.type === "image/webp" ? "webp" : "jpg";
    const baseName = (file.name || "image").replace(/\.\w+$/, "");
    return new File([bestBlob], `${baseName}.${ext}`, { type: bestBlob.type });
  } catch (e) {
    // Trình duyệt không hỗ trợ createImageBitmap/canvas, hoặc ảnh lỗi decode
    // - lùi về gửi file gốc, không chặn người dùng gửi tin.
    return file;
  }
}
