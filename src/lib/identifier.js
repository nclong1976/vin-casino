/**
 * Supabase Auth chỉ chấp nhận địa chỉ email hợp lệ, nhưng form đăng
 * ký/đăng nhập của app cho phép nhập số điện thoại hoặc tên đăng nhập tùy
 * ý ("Tên đăng nhập hoặc số điện thoại"). Nếu gửi thẳng giá trị đó cho
 * Supabase, các trường hợp không phải email sẽ bị từ chối ngay lập tức -
 * tài khoản chỉ được tạo ở base44 legacy (localStorage cục bộ của trình
 * duyệt đó), không đồng bộ được sang thiết bị khác.
 *
 * Quy tắc: nếu định danh đã là email thì giữ nguyên; nếu không, gắn thêm
 * hậu tố cố định để tạo một email hợp lệ duy nhất đại diện cho định danh
 * đó trên Supabase Auth. Áp dụng NHẤT QUÁN ở cả đăng ký và đăng nhập để
 * cùng một định danh luôn ánh xạ tới cùng một tài khoản Supabase.
 */
const SYNTHETIC_EMAIL_SUFFIX = "@vinclub.com";

export function normalizeIdentifierToAuthEmail(identifier) {
  const clean = (identifier || "").trim().toLowerCase();
  if (!clean) return "";
  if (clean.includes("@")) return clean;
  // Loại bỏ khoảng trắng/ký tự không hợp lệ trong phần local-part của email
  const safeLocalPart = clean.replace(/[^a-z0-9._-]/g, "");
  return `${safeLocalPart}${SYNTHETIC_EMAIL_SUFFIX}`;
}

export function isPhoneNumber(identifier) {
  return /^\d{8,15}$/.test((identifier || "").trim());
}
