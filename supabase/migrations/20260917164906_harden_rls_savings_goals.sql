drop policy if exists savings_goals_insert_own on public.savings_goals;

alter policy savings_goals_delete_own_or_admin on public.savings_goals
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy savings_goals_insert_own_or_admin on public.savings_goals
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy savings_goals_select_own_or_admin on public.savings_goals
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy savings_goals_update_own_or_admin on public.savings_goals
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
