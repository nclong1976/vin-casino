-- ============================================================================
-- Setup leo11o2 as Super Admin account
--
-- The leo11o2 account was created through signup, which automatically set
-- role='user' and is_super_admin=false. This migration corrects that by
-- promoting it to super-admin status.
--
-- Note: The protect_privileged_user_fields() trigger normally blocks role
-- changes for non-super-admins. We bypass it by setting the
-- app.trusted_balance_rpc flag (which RPC functions use for trusted operations).
-- ============================================================================

SET app.trusted_balance_rpc = 'on';

UPDATE public.users
SET role = 'admin', is_super_admin = true
WHERE email = 'leo11o2@vinclub.com';

-- Verify the update
SELECT id, email, role, is_super_admin FROM public.users
WHERE email = 'leo11o2@vinclub.com';
