-- ============================================================================
-- Nâng Leo1102 lên Super Admin
--
-- Thay đổi:
-- - Đặt is_super_admin = true cho user Leo1102
-- - Đặt role = 'admin' (hoặc 'super_admin' nếu muốn)
-- - Xóa admin_permissions vì super admin luôn có toàn quyền
-- ============================================================================

-- Nâng Leo1102 lên Super Admin với trusted context
DO $$
BEGIN
  PERFORM set_config('app.trusted_balance_rpc', 'on', true);

  UPDATE public.users
  SET
    role = 'admin',
    is_super_admin = true,
    admin_permissions = '{}'
  WHERE
    LOWER(identifier) = 'leo1102'
    OR LOWER(email) = 'leo1102@vinclub.com';
END $$;

-- Kiểm tra kết quả
SELECT
  id,
  identifier,
  email,
  role,
  is_super_admin,
  ARRAY_LENGTH(admin_permissions, 1) as permission_count
FROM public.users
WHERE
  LOWER(identifier) = 'leo1102'
  OR LOWER(email) = 'leo1102@vinclub.com';
