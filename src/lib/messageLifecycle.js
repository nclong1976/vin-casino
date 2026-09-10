import { base44 } from "@/api/base44Client";

/**
 * Vòng đời hiển thị cho 1 tin nhắn CSKH CỦA CHÍNH MÌNH gửi đi (isMine=false
 * luôn trả về null - bubble của đối phương không hiện tick trạng thái, chỉ
 * người gửi mới cần biết tin đã tới đâu).
 *
 * "sending"/"failed" là cờ cục bộ (message.__status) gắn tạm trên bản ghi
 * optimistic TRƯỚC khi Postgres xác nhận - không phải cột DB. Một khi
 * message đã có __supabaseSynced (Message.create()/update() đã resolve
 * thành công) và không còn __status, trạng thái suy ra thẳng từ
 * delivered_at/read_at (2 cột thật, xem migration
 * 20260910093000_message_lifecycle_status.sql).
 */
export function deriveMessageStatus(message, isMine) {
  if (!isMine || !message) return null;
  if (message.__status === "sending") return "sending";
  if (message.__status === "failed") return "failed";
  if (message.read_at) return "read";
  if (message.delivered_at) return "delivered";
  return "sent";
}

const DEBOUNCE_MS = 800;

function createBatcher(field) {
  const pending = new Set();
  let timer = null;

  const flush = () => {
    timer = null;
    if (pending.size === 0) return;
    const ids = Array.from(pending);
    pending.clear();
    const now = new Date().toISOString();
    base44.entities.Message.bulkUpdate(ids.map((id) => ({ id, [field]: now }))).catch(() => {});
  };

  return (ids) => {
    (ids || []).forEach((id) => {
      if (id) pending.add(id);
    });
    if (pending.size === 0) return;
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  };
}

// Gom id theo cửa sổ debounce ngắn rồi ghi 1 lượt (base44.entities.Message.
// bulkUpdate() đã có sẵn) thay vì 1 UPDATE riêng cho mỗi tin - tránh bão
// request khi 1 hội thoại có nhiều tin cùng lúc chuyển trạng thái (vd mở
// lại hội thoại có hàng chục tin chưa đọc).
export const markDelivered = createBatcher("delivered_at");
export const markRead = createBatcher("read_at");
