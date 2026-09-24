drop policy if exists transactions_delete_admin_only on public.transactions;

alter policy transactions_delete_own_or_admin on public.transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy transactions_insert_own_or_admin on public.transactions
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy transactions_select_own_or_admin on public.transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy transactions_update_own_or_admin on public.transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
