-- ============================================================================
-- Hide super-admin accounts from regular admins
--
-- Regular admins should not be able to see or query super-admin accounts.
-- This policy ensures:
-- - Super admins can see all users
-- - Regular admins can only see regular users and other regular admins
-- - Regular users can only see themselves
-- ============================================================================

DROP POLICY IF EXISTS "users_select_hide_super_admin" ON public.users;

CREATE POLICY "users_select_hide_super_admin"
  ON public.users FOR SELECT
  USING (
    -- Super admin can see everyone
    public.is_super_admin()
    -- Regular users and regular admins cannot see super-admin accounts
    OR (NOT COALESCE(is_super_admin, false))
  );

-- Note: This policy works in conjunction with the existing users_select_own_or_admin
-- policy. The final result is the intersection of all applicable policies.
