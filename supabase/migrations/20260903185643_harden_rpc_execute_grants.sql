-- Bịt lỗ hổng: telegram_process_wallet_transaction() KHÔNG có kiểm tra
-- is_admin()/auth.uid() bên trong (theo thiết kế - server.ts gọi bằng
-- service_role, tự truyền p_admin_label). Nhưng grant thực tế trên DB đang
-- cho phép cả anon/authenticated gọi thẳng RPC này qua PostgREST, tức bất kỳ
-- ai (kể cả chưa đăng nhập) có thể tự APPROVE/REJECT lệnh nạp/rút của người
-- khác và cộng/trừ số dư tuỳ ý. Không có nơi nào trong src/ gọi hàm này (chỉ
-- server.ts qua service_role) nên revoke không ảnh hưởng ứng dụng.
REVOKE ALL ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) TO service_role;

-- Hardening: các RPC ví/game dưới đây đều tự kiểm tra auth.uid()/is_admin()
-- bên trong nên gọi bằng anon (chưa đăng nhập) vốn đã luôn bị chặn ở logic -
-- nhưng Supabase mặc định vẫn cấp EXECUTE cho anon/authenticated qua ALTER
-- DEFAULT PRIVILEGES lúc tạo hàm mới. Thu hẹp lại: chỉ authenticated (đúng
-- như cách src/lib/supabaseDb.js đang gọi) và service_role mới gọi được,
-- giảm bề mặt tấn công/spam từ client ẩn danh mà không đổi hành vi ứng dụng.
REVOKE EXECUTE ON FUNCTION public.increment_user_balance(text, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_user_balance(text, bigint, bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_user_balance_absolute(text, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_balance_absolute(text, bigint, bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.contribute_to_savings_goal(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_to_savings_goal(text, bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_savings_goal(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_savings_goal(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.withdraw_from_savings_goal(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_from_savings_goal(text, bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_withdrawal(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.place_tiger_baccarat_bet(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_tiger_baccarat_bet(text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_tiger_baccarat_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tiger_baccarat_round(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_my_stale_casino_round(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_my_stale_casino_round(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.play_baicao_round(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_baicao_round(bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.start_xitobala_round(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_xitobala_round(bigint) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.raise_xitobala_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_xitobala_round(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reveal_xitobala_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_xitobala_round(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.spin_lucky_wheel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_project_maturity_payout(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_project_maturity_payout(text) TO authenticated, service_role;
