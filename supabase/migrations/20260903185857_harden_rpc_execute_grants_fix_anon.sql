-- Bổ sung: dự án Supabase mặc định có ALTER DEFAULT PRIVILEGES GRANT EXECUTE
-- ON FUNCTIONS trực tiếp cho anon/authenticated (không chỉ qua PUBLIC), nên
-- REVOKE ... FROM PUBLIC ở migration trước không đủ - vẫn còn EXECUTE cho
-- anon. Revoke tường minh từ anon (giữ lại authenticated, service_role).
REVOKE EXECUTE ON FUNCTION public.increment_user_balance(text, bigint, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_user_balance_absolute(text, bigint, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.contribute_to_savings_goal(text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_savings_goal(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_from_savings_goal(text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_tiger_baccarat_bet(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_tiger_baccarat_round(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_my_stale_casino_round(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.play_baicao_round(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_xitobala_round(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.raise_xitobala_round(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reveal_xitobala_round(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.spin_lucky_wheel() FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_project_maturity_payout(text) FROM anon;
