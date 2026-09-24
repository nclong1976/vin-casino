alter policy casino_maintenance_config_admin_only on public.casino_maintenance_config
  using (is_admin_user() and not public.is_anon_session())
  with check (is_admin_user() and not public.is_anon_session());

alter policy casino_maintenance_config_write_admin_only on public.casino_maintenance_config
  using (is_admin() and not public.is_anon_session())
  with check (is_admin() and not public.is_anon_session());

alter policy casino_maintenance_config_select_authenticated on public.casino_maintenance_config
  using (true and not public.is_anon_session());
