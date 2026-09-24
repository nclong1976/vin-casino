drop policy if exists audit_logs_insert_admin_only on public.audit_logs;
drop policy if exists audit_logs_select_admin_only on public.audit_logs;

alter policy audit_logs_admin_only on public.audit_logs
  using (is_admin_user() and not public.is_anon_session())
  with check (is_admin_user() and not public.is_anon_session());
