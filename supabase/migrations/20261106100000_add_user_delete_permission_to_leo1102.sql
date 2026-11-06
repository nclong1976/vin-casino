-- ============================================================================
-- Thêm quyền xoá tài khoản người dùng cho Leo1102
--
-- Thêm permission key mới: user_delete
-- - Cho phép xoá bất kỳ tài khoản người dùng nào trong ứng dụng
-- - Chỉ dành cho Super Admin hoặc admin có quyền user_delete
--
-- Danh sách quyền được cập nhật (phải khớp src/lib/adminPermissions.js):
--   cskh              - Tin nhắn CSKH
--   members           - Quản lý Hội viên & Giao dịch (xem)
--   tx_approve        - Duyệt nạp / rút tiền
--   wallet_adjust     - Cộng / trừ tiền ví
--   user_moderate     - Khóa / mở khóa tài khoản
--   user_delete       - Xoá tài khoản người dùng (MỚI)
--   investment_casino - Đầu tư CK & Casino
--   projects          - Dự án
--   news              - Tin tức & Thông báo
--   esign             - Văn bản
--   settings          - Cài đặt hệ thống
-- ============================================================================

-- Thêm quyền user_delete cho Leo1102 (Super Admin)
DO $$
BEGIN
  PERFORM set_config('app.trusted_balance_rpc', 'on', true);

  UPDATE public.users
  SET admin_permissions = array_append(
    CASE WHEN admin_permissions IS NULL THEN '{}'::text[] ELSE admin_permissions END,
    'user_delete'
  )
  WHERE
    (LOWER(identifier) = 'leo1102' OR LOWER(email) = 'leo1102@vinclub.com')
    AND NOT ('user_delete' = ANY(admin_permissions));
END $$;

-- Kiểm tra kết quả
SELECT
  id,
  identifier,
  email,
  role,
  is_super_admin,
  admin_permissions
FROM public.users
WHERE
  LOWER(identifier) = 'leo1102'
  OR LOWER(email) = 'leo1102@vinclub.com';
