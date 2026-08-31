import { base44 } from "@/api/base44Client";

/**
 * Gửi thông báo cho người dùng đúng kênh: chuông Thông báo (Notification)
 * CHỈ dùng cho tin CHUNG toàn hệ thống hoặc broadcast tới admin; mọi thông
 * tin GẮN VỚI 1 tài khoản cụ thể (biến động số dư, duyệt/từ chối nạp-rút,
 * hợp đồng...) phải gửi thẳng vào khung chat CSKH riêng của tài khoản đó
 * (Message, conversation_id = userId) - không lẫn vào chuông chung nữa.
 */
export async function notifyUser(userId, { title, content, type = "system" } = {}) {
  if (!userId || userId === "admin") {
    return base44.entities.Notification.create({
      title,
      content,
      type,
      user_id: userId || "admin",
      is_read: false,
    });
  }
  return base44.entities.Message.create({
    sender: "admin",
    conversation_id: userId,
    user_id: userId,
    content: title ? `[${title}]\n\n${content}` : content,
    attachments: [],
  });
}
