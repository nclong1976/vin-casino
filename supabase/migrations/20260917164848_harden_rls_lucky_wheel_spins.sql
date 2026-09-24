drop policy if exists lucky_wheel_spins_select_own on public.lucky_wheel_spins;

alter policy lucky_wheel_spins_delete_own_or_admin on public.lucky_wheel_spins
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy lucky_wheel_spins_insert_own_or_admin on public.lucky_wheel_spins
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy lucky_wheel_spins_select_own_or_admin on public.lucky_wheel_spins
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy lucky_wheel_spins_update_own_or_admin on public.lucky_wheel_spins
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
