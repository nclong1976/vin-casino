drop policy if exists casino_secure_config_write_admin on public.casino_secure_config;
drop policy if exists casino_secure_config_select_admin on public.casino_secure_config;

alter policy casino_secure_config_admin_only on public.casino_secure_config
  using (is_admin_user() and not public.is_anon_session())
  with check (is_admin_user() and not public.is_anon_session());
