alter policy messen_admin_only on public.messen
  using (is_admin_user() and not public.is_anon_session())
  with check (is_admin_user() and not public.is_anon_session());

alter policy messen_all_own_or_admin on public.messen
  to authenticated
  using (((created_by_id = (select auth.uid())::text) or is_admin()) and not public.is_anon_session())
  with check (((created_by_id = (select auth.uid())::text) or is_admin()) and not public.is_anon_session());
