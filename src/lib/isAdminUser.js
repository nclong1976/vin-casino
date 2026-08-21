// Xác định 1 tài khoản có phải Quản trị viên (admin) hay không.
// Dùng chung cho AdminRoute (chặn truy cập) và App (tách luồng admin/người dùng).
//
// BẢO MẬT: nguồn đáng tin cậy DUY NHẤT là user.role/user.is_super_admin - 2
// field này giờ được syncEngine.js chốt cứng lấy từ đúng bản ghi Postgres
// theo uid (xem hydrateUserOnNewDevice), không còn bị "ăn nhầm" role từ nơi
// khác nữa. KHÔNG dùng kiểu dò chuỗi email (`.includes("admin")`) như code
// cũ - bất kỳ ai đăng ký email có chữ "admin" (vd. "admin_fan99@gmail.com")
// sẽ vô tình có toàn quyền admin, đây là lỗ hổng nghiêm trọng đã gỡ bỏ.
//
// Danh sách bên dưới CHỈ còn giữ lại 1 nhóm nhỏ tài khoản khởi tạo hệ thống
// (bootstrap owner) dùng để đảm bảo chủ dự án không bao giờ bị khóa khỏi
// chính Bảng quản trị của mình nếu dữ liệu role trên Postgres có trục trặc -
// đây là danh sách CỐ ĐỊNH, khớp CHÍNH XÁC (không dò chuỗi con).
const BOOTSTRAP_OWNER_EMAILS = ["nclong1976@gmail.com", "leo1102@vinclub.com"];
const BOOTSTRAP_OWNER_USERNAMES = ["nclong"];

export default function isAdminUser(user) {
  if (!user) return false;

  const emailLower = (user.email || "").toLowerCase();
  const usernameLower = (user.username || "").toLowerCase();

  return Boolean(
    user.role === "admin" ||
    user.role === "ADMIN" ||
    user.is_super_admin ||
    BOOTSTRAP_OWNER_EMAILS.includes(emailLower) ||
    BOOTSTRAP_OWNER_USERNAMES.includes(usernameLower)
  );
}

/**
 * Super Admin là một cấp RIÊNG, cao hơn admin thường - dùng cho các thao
 * tác không thể hoàn tác (xóa vĩnh viễn người dùng, xóa tin nhắn hội thoại
 * CSKH...). KHÔNG được coi mọi admin thường là super admin (lỗi từng gặp ở
 * UsersTab.jsx/UserDetailModal.jsx: `role === "admin"` bị OR nhầm vào điều
 * kiện super admin, khiến admin thường cũng xóa được tài khoản người dùng).
 */
export function isSuperAdminUser(user) {
  if (!user) return false;

  const emailLower = (user.email || "").toLowerCase();
  const usernameLower = (user.username || "").toLowerCase();

  return Boolean(
    user.is_super_admin ||
    BOOTSTRAP_OWNER_EMAILS.includes(emailLower) ||
    BOOTSTRAP_OWNER_USERNAMES.includes(usernameLower)
  );
}
