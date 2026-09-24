drop policy if exists users_delete_admin_only on public.users;

alter policy users_delete_own_or_admin on public.users
  using (((id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy users_insert_own_or_admin on public.users
  with check (((id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy users_select_own_or_admin on public.users
  using (((id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy users_update_own_or_admin on public.users
  using (((id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
