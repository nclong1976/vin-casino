-- Bù 28 RLS policy có trên production nhưng chưa từng được tạo bởi migration
-- nào trong repo (được tạo thẳng trên dashboard). Các migration
-- block_anonymous_sessions_* / harden_rls_* ngay sau đây gọi ALTER POLICY
-- lên chúng, nên dựng database mới từ đầu (Supabase Preview Branch, local)
-- luôn lỗi "policy ... does not exist" - cùng loại lỗi đã vá ở
-- 20260905070000_is_admin_user_function_for_ci_replay.sql.
--
-- Định nghĩa dưới đây lấy nguyên từ pg_policies của production. Mọi lệnh đều
-- có điều kiện "chưa tồn tại mới tạo", nên trên production (đã có đủ) file
-- này không thay đổi gì.

-- is_anon_session() chính thức được tạo ở 20260917163311 (chạy sau file
-- này) nhưng các policy bên dưới đã cần tới nó. Chỉ tạo khi chưa có - không
-- CREATE OR REPLACE để không ghi đè bản trên production (đã được
-- 20260917165057 đặt search_path).
DO $do$
BEGIN
  IF to_regprocedure('public.is_anon_session()') IS NULL THEN
    CREATE FUNCTION public.is_anon_session()
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SET search_path = public, auth
    AS $fn$
      select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
    $fn$;
  END IF;
END
$do$;

DO $do$
DECLARE
  -- Điều kiện dùng chung, đúng như trên production.
  own text := '(((user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin_user()) AND (NOT is_anon_session()))';
  own_user text := '(((id = (( SELECT auth.uid() AS uid))::text) OR is_admin_user()) AND (NOT is_anon_session()))';
  admin_only text := '(is_admin_user() AND (NOT is_anon_session()))';
  p record;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      -- (bảng, tên policy, lệnh, USING, WITH CHECK)
      ('audit_logs', 'audit_logs_admin_only', 'ALL', admin_only, admin_only),
      ('bank_accounts', 'bank_accounts_delete_own_or_admin', 'DELETE', own, NULL),
      ('bank_accounts', 'bank_accounts_insert_own_or_admin', 'INSERT', NULL, own),
      ('bank_accounts', 'bank_accounts_select_own_or_admin', 'SELECT', own, NULL),
      ('bank_accounts', 'bank_accounts_update_own_or_admin', 'UPDATE', own, own),
      ('casino_maintenance_config', 'casino_maintenance_config_admin_only', 'ALL', admin_only, admin_only),
      ('casino_rounds', 'casino_rounds_delete_own_or_admin', 'DELETE', own, NULL),
      ('casino_rounds', 'casino_rounds_insert_own_or_admin', 'INSERT', NULL, own),
      ('casino_rounds', 'casino_rounds_select_own_or_admin', 'SELECT', own, NULL),
      ('casino_rounds', 'casino_rounds_update_own_or_admin', 'UPDATE', own, own),
      ('casino_secure_config', 'casino_secure_config_admin_only', 'ALL', admin_only, admin_only),
      ('lucky_wheel_spins', 'lucky_wheel_spins_delete_own_or_admin', 'DELETE', own, NULL),
      ('lucky_wheel_spins', 'lucky_wheel_spins_insert_own_or_admin', 'INSERT', NULL, own),
      ('lucky_wheel_spins', 'lucky_wheel_spins_select_own_or_admin', 'SELECT', own, NULL),
      ('lucky_wheel_spins', 'lucky_wheel_spins_update_own_or_admin', 'UPDATE', own, own),
      ('messen', 'messen_admin_only', 'ALL', admin_only, admin_only),
      ('notifications', 'notifications_insert_own_or_admin', 'INSERT', NULL, own),
      ('savings_goals', 'savings_goals_insert_own_or_admin', 'INSERT', NULL, own),
      ('signatures', 'signatures_delete_own_or_admin', 'DELETE', own, NULL),
      ('signatures', 'signatures_insert_own_or_admin', 'INSERT', NULL, own),
      ('signatures', 'signatures_select_own_or_admin', 'SELECT', own, NULL),
      ('signatures', 'signatures_update_own_or_admin', 'UPDATE', own, own),
      ('transactions', 'transactions_delete_own_or_admin', 'DELETE', own, NULL),
      ('users', 'users_delete_own_or_admin', 'DELETE', own_user, NULL),
      ('wallet_transactions', 'wallet_transactions_delete_own_or_admin', 'DELETE', own, NULL),
      ('wallet_transactions', 'wallet_transactions_insert_own_or_admin', 'INSERT', NULL, own),
      ('wallet_transactions', 'wallet_transactions_select_own_or_admin', 'SELECT', own, NULL),
      ('wallet_transactions', 'wallet_transactions_update_own_or_admin', 'UPDATE', own, own)
    ) AS v(tbl, name, cmd, using_expr, check_expr)
  LOOP
    CONTINUE WHEN to_regclass(format('public.%I', p.tbl)) IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p.tbl AND policyname = p.name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO authenticated%s%s',
      p.name,
      p.tbl,
      p.cmd,
      CASE WHEN p.using_expr IS NOT NULL THEN format(' USING (%s)', p.using_expr) ELSE '' END,
      CASE WHEN p.check_expr IS NOT NULL THEN format(' WITH CHECK (%s)', p.check_expr) ELSE '' END
    );
  END LOOP;
END
$do$;
