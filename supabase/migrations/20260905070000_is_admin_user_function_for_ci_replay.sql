-- CI/preview-only shim: a fresh "Supabase Preview" database replays every
-- migration in this folder from an empty database, strictly in filename
-- order. On production, public.is_admin_user() was created directly (not
-- via any migration file) before 20260905075608_fix_notifications_broadcast_select.sql
-- was ever pushed, so that migration succeeded there even though no local
-- file defined the function yet. 20260905081851_add_missing_is_admin_user_function.sql
-- later backfilled that gap, but its remote-matching version number
-- (081851) sorts AFTER 075608, so a from-scratch replay still fails with
-- "function is_admin_user() does not exist" when it reaches the
-- notifications policy. This shim carries an earlier timestamp so a fresh
-- replay defines the function in time; it is a no-op CREATE OR REPLACE
-- identical to the later migration's body, so re-applying it on production
-- changes nothing.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = (SELECT auth.uid())::text
      AND role = 'admin'
    );
$function$;
