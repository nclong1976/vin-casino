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
// Trần dung lượng SAU KHI nén - vá lỗi thực tế đã xảy ra: ảnh chụp màn hình
// (nhiều cạnh/chữ sắc nét, JPEG nén kém hiệu quả) vẫn cho ra file vài MB dù
// đã qua compressImageFile ở mức mặc định, ghi thẳng base64 vài MB đó vào
// cột "attachments" (không có S3/CDN thật, xem comment đầu file) khiến bảng
// "messages" phình to bất thường - truy vấn liệt kê tin nhắn (SELECT toàn bộ
// bảng, không lọc theo hội thoại - xem fetchFromSupabase() trong
// base44Client.js) phải giải nén hàng chục MB dữ liệu mỗi lượt, vượt
// statement_timeout (8s) của Postgres và làm chính request GỬI ảnh đó (và
// mọi request khác đọc/ghi bảng messages cùng lúc) bị lỗi 500. Vòng lặp dưới
// đây hạ dần quality rồi hạ dần kích thước cho tới khi dưới trần này (hoặc
// hết lượt thử) thay vì chỉ thử đúng 1 mức quality cố định như trước.
const MAX_OUTPUT_BYTES = 700 * 1024;

export async function compressImageFile(file, { maxDimension = 1600, quality = 0.75 } = {}) {
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
      const q = Math.max(0.35, quality - attempt * 0.15);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
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

    const baseName = (file.name || "image").replace(/\.\w+$/, "");
    return new File([bestBlob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch (e) {
    // Trình duyệt không hỗ trợ createImageBitmap/canvas, hoặc ảnh lỗi decode
    // - lùi về gửi file gốc, không chặn người dùng gửi tin.
    return file;
  }
}
