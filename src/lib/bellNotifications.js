/**
 * Lọc danh sách thông báo hiển thị ở chuông (NotificationBell.jsx) cho 1 tài
 * khoản:
 * - Tin CHUNG toàn hệ thống (không gắn user_id), broadcast tới admin ("admin"
 *   là giá trị đặc biệt, không phải id thật) và tin riêng của chính tài khoản.
 * - Văn bản cần ký (type "document") chỉ hiện ở Hộp thư văn bản, không lặp ở
 *   chuông.
 * - Tin broadcast tạo TRƯỚC thời điểm tài khoản được tạo bị ẩn - hội viên mới
 *   đăng ký thấy chuông trống, chỉ có tin chào mừng riêng (tạo bởi trigger
 *   welcome_notification_on_signup). Tin riêng (user_id = id tài khoản) luôn
 *   giữ nguyên.
 */
export function filterBellNotifications(list, user) {
  if (!user) return [];
  const createdAt = user.created_at ? new Date(user.created_at).getTime() : NaN;
  return (list || []).filter((n) => {
    if (!n || n.type === "document") return false;
    if (n.user_id === user.id) return true;
    const isBroadcast = !n.user_id || (n.user_id === "admin" && user.role === "admin");
    if (!isBroadcast) return false;
    if (Number.isNaN(createdAt)) return true;
    const notifAt = new Date(n.created_date).getTime();
    return Number.isNaN(notifAt) || notifAt >= createdAt;
  });
}
