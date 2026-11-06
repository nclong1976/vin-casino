-- ============================================================================
-- Cấp quyền CSKH và Members cho Leo1102
--
-- Đảm bảo Leo1102 có thể:
-- - Xem & quản lý tin nhắn CSKH
-- - Xoá/quản lý tài khoản người dùng
-- - Có tất cả quyền admin khác
-- ============================================================================

DO $$
BEGIN
  PERFORM set_config('app.trusted_balance_rpc', 'on', true);

  -- Cấp tất cả quyền (bao gồm cskh, members, user_delete, v.v.)
  UPDATE public.users
  SET admin_permissions = ARRAY[
    'cskh',
    'members',
    'tx_approve',
    'wallet_adjust',
    'user_moderate',
    'user_delete',
    'investment_casino',
    'projects',
    'news',
    'esign',
    'settings'
  ]
  WHERE
    (LOWER(identifier) = 'leo1102' OR LOWER(email) = 'leo1102@vinclub.com')
    AND is_super_admin = true;
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
