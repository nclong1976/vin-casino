drop policy if exists bank_accounts_all_own_or_admin on public.bank_accounts;

alter policy bank_accounts_delete_own_or_admin on public.bank_accounts
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy bank_accounts_insert_own_or_admin on public.bank_accounts
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy bank_accounts_select_own_or_admin on public.bank_accounts
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy bank_accounts_update_own_or_admin on public.bank_accounts
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
