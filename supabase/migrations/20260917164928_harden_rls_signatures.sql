drop policy if exists signatures_all_own_or_admin on public.signatures;

alter policy signatures_delete_own_or_admin on public.signatures
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy signatures_insert_own_or_admin on public.signatures
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy signatures_select_own_or_admin on public.signatures
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy signatures_update_own_or_admin on public.signatures
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
