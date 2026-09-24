drop policy if exists casino_rounds_select_own on public.casino_rounds;

alter policy casino_rounds_delete_own_or_admin on public.casino_rounds
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy casino_rounds_insert_own_or_admin on public.casino_rounds
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy casino_rounds_select_own_or_admin on public.casino_rounds
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy casino_rounds_update_own_or_admin on public.casino_rounds
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
