/**
 * cskhConversation.js
 * ─────────────────────────────────────────────────────────────────
 * Trước đây conversation_id của khách LUÔN bằng user.id (1 hội thoại suốt
 * đời). Theo thiết kế mới: nếu khách rời trang CSKH (Support.jsx unmount
 * hoặc tab bị ẩn) >= 10 phút rồi quay lại, tự bắt đầu 1 conversation_id MỚI
 * - không xóa gì, hội thoại cũ vẫn nguyên vẹn để Admin tra cứu (xem migration
 * cskh_rotating_conversation_id.sql - RLS/trigger đã hỗ trợ conversation_id
 * khác user_id).
 *
 * Lưu trạng thái ở localStorage (theo từng trình duyệt) thay vì cột trên
 * users - đây thuần là hành vi UI ("bắt đầu lại cho gọn"), không phải dữ
 * liệu tài chính/nghiệp vụ cần đồng bộ tuyệt đối đa thiết bị. Đánh đổi: đổi
 * trình duyệt/thiết bị có thể thấy hội thoại active khác nhau - chấp nhận
 * được cho tính năng này.
 */

const ACTIVE_KEY_PREFIX = "cskh_active_conversation:";
const LEFT_AT_KEY_PREFIX = "cskh_left_support_at:";
export const CSKH_AWAY_THRESHOLD_MS = 10 * 60 * 1000;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function newConversationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "cskh_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

/**
 * Trả về conversation_id ĐANG HOẠT ĐỘNG cho khách hàng này. Lần đầu tiên
 * (chưa từng lưu gì ở thiết bị này) dùng chính userId - giữ đúng hành vi cũ,
 * tương thích dữ liệu hiện có (mọi hội thoại cũ đều có id = user.id). Chỉ
 * sinh conversation_id MỚI khi khoảng cách từ lần rời trang CSKH gần nhất
 * (xem recordLeftSupport()) đã >= CSKH_AWAY_THRESHOLD_MS.
 */
export function getActiveConversationId(userId) {
  if (!userId) return null;

  const activeKey = ACTIVE_KEY_PREFIX + userId;
  const leftAtKey = LEFT_AT_KEY_PREFIX + userId;

  const stored = safeGet(activeKey);
  if (!stored) {
    safeSet(activeKey, userId);
    return userId;
  }

  const leftAtRaw = safeGet(leftAtKey);
  const leftAt = leftAtRaw ? Number(leftAtRaw) : null;
  if (leftAt && Date.now() - leftAt >= CSKH_AWAY_THRESHOLD_MS) {
    const fresh = newConversationId();
    safeSet(activeKey, fresh);
    safeRemove(leftAtKey);
    return fresh;
  }

  return stored;
}

/** Ghi lại thời điểm rời trang CSKH - gọi khi Support.jsx unmount hoặc tab bị ẩn. */
export function recordLeftSupport(userId) {
  if (!userId) return;
  safeSet(LEFT_AT_KEY_PREFIX + userId, String(Date.now()));
}
