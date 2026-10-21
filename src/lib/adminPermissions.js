// Phân quyền chi tiết cho từng tài khoản admin (RBAC) - nguồn DUY NHẤT phía
// client. Phải khớp các khóa quyền trong migration
// 20261025090000_admin_permissions_rbac.sql (hàm has_admin_permission()).
//
// Đây CHỈ là lớp chặn giao diện (ẩn tab/nút). Lớp chốt chặn thật nằm ở
// Postgres (has_admin_permission() gắn vào RPC/RLS) - admin thiếu quyền dù có
// gọi thẳng API cũng bị từ chối.
import { isSuperAdminUser } from "@/lib/isAdminUser";

// Khóa quyền -> nhãn hiển thị (giữ đúng thứ tự để render màn hình quản lý).
export const ADMIN_PERMISSION_LABELS = {
  cskh: "Tin nhắn CSKH",
  members: "Quản lý Hội viên & Giao dịch",
  tx_approve: "Duyệt nạp / rút tiền",
  wallet_adjust: "Cộng / trừ tiền ví",
  user_moderate: "Khóa / mở khóa tài khoản",
  investment_casino: "Đầu tư CK & Casino",
  projects: "Dự án",
  news: "Tin tức & Thông báo",
  esign: "Văn bản",
  settings: "Cài đặt hệ thống",
};

export const ALL_ADMIN_PERMISSIONS = Object.keys(ADMIN_PERMISSION_LABELS);

/**
 * Admin này có quyền `key` không?
 * - Super admin / chủ sở hữu (isSuperAdminUser): LUÔN có mọi quyền.
 * - Admin thường: chỉ khi key nằm trong user.admin_permissions.
 */
export function hasAdminPermission(user, key) {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const perms = Array.isArray(user.admin_permissions) ? user.admin_permissions : [];
  return perms.includes(key);
}
