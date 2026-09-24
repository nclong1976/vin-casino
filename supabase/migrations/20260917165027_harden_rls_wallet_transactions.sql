drop policy if exists wallet_tx_delete_admin_only on public.wallet_transactions;
drop policy if exists wallet_tx_insert_own on public.wallet_transactions;
drop policy if exists wallet_tx_select_own_or_admin on public.wallet_transactions;
drop policy if exists wallet_tx_update_admin_only on public.wallet_transactions;

alter policy wallet_transactions_delete_own_or_admin on public.wallet_transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy wallet_transactions_insert_own_or_admin on public.wallet_transactions
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy wallet_transactions_select_own_or_admin on public.wallet_transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());

alter policy wallet_transactions_update_own_or_admin on public.wallet_transactions
  using (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session())
  with check (((user_id = (select auth.uid())::text) or is_admin_user()) and not public.is_anon_session());
