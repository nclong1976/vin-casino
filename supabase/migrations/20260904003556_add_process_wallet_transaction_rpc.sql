-- Màn hình admin duyệt nạp/rút tiền trong app (TransactionsTab.jsx) tự làm
-- 4 bước RIÊNG RẼ ở client (cộng/trừ ví qua adjustUserBalance() không
-- nghiêm ngặt -> cập nhật status -> notifyUser() -> AuditLog.create()) -
-- KHÔNG nằm trong 1 giao dịch nguyên tử nào và KHÔNG khoá chống trùng, nên
-- bấm duyệt 2 lần (hoặc 2 admin cùng duyệt 1 lệnh gần như đồng thời) có thể
-- cộng/trừ tiền 2 lần cho cùng 1 lệnh.
--
-- Hệ thống đã có sẵn ĐÚNG cơ chế an toàn cho việc này (khoá dòng + xử lý
-- đúng 1 lần) nhưng nằm rải rác ở 2 nơi không dùng được cho luồng admin
-- trong app:
--   - process_withdrawal(): chỉ xử lý được 'withdraw', không có 'deposit',
--     và CHƯA TỪNG được gọi ở đâu trong client (code chết).
--   - telegram_process_wallet_transaction(): xử lý được cả 2 loại đúng cách
--     nhưng chỉ GRANT cho service_role (tin tưởng server.ts đã tự xác thực
--     người bấm nút Telegram là admin), không dùng is_admin()/auth.uid()
--     nên không an toàn nếu mở cho phiên đăng nhập admin gọi thẳng.
--
-- RPC mới dưới đây dùng lại nguyên logic đã đúng của
-- telegram_process_wallet_transaction (khoá dòng FOR UPDATE + status=
-- 'pending', xử lý cả deposit/withdraw, ghi tin nhắn CSKH đúng theo quy ước
-- notifyUser.js thay vì bảng notifications chung) nhưng gắn is_admin()/
-- auth.uid() để phiên đăng nhập admin trong app gọi thẳng được an toàn.
--
-- process_withdrawal() bị thay thế hoàn toàn bởi RPC này (đã xác nhận
-- không còn nơi nào gọi tới) nên xoá luôn để tránh duy trì 3 bản gần giống
-- nhau của cùng 1 logic.
DROP FUNCTION IF EXISTS public.process_withdrawal(text, text, text);

CREATE OR REPLACE FUNCTION public.process_wallet_transaction(p_tx_id text, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS wallet_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx public.wallet_transactions;
  v_admin_email text;
  v_title text;
  v_content text;
  v_refund_code text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_ACTION';
  end if;

  v_admin_email := coalesce(auth.jwt() ->> 'email', 'admin');

  select * into v_tx from public.wallet_transactions
  where id = p_tx_id and status = 'pending' and type in ('deposit', 'withdraw')
  for update;

  if not found then
    raise exception 'ALREADY_PROCESSED';
  end if;

  if p_action = 'approve' then
    update public.wallet_transactions set
      status = 'completed', approved_at = now(), approved_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    if v_tx.type = 'deposit' then
      -- Nạp tiền: chỉ cộng ví khi Admin phê duyệt (chưa hề cộng lúc tạo lệnh)
      perform set_config('app.trusted_balance_rpc', 'on', true);
      update public.users set
        balance = greatest(0, balance + v_tx.amount),
        total_deposited = total_deposited + v_tx.amount,
        balance_version = balance_version + 1,
        last_active = now()
        where id = v_tx.user_id;

      v_title := 'Biến động số dư: +' || v_tx.amount || ' VNĐ';
      v_content := 'Yêu cầu nạp tiền mã ' || coalesce(v_tx.code, v_tx.id) ||
        ' đã được Quản trị viên phê duyệt. Số dư ví được cộng thêm ' || v_tx.amount || ' VNĐ.';
    else
      -- Rút tiền: số dư đã bị trừ ngay lúc user tạo lệnh (adjustUserBalanceStrict
      -- trong WithdrawModal.jsx) - duyệt chỉ đổi trạng thái, không đụng số dư.
      v_title := 'Biến động số dư: -' || v_tx.amount || ' VNĐ';
      v_content := 'Yêu cầu rút tiền mã ' || coalesce(v_tx.code, v_tx.id) ||
        ' đã được Quản trị viên phê duyệt. Tiền đã chuyển về ngân hàng ' ||
        coalesce(v_tx.bank_name, 'đối tác') || ' (' || coalesce(v_tx.account_number, '') || ').';
    end if;
  else
    update public.wallet_transactions set
      status = 'rejected', rejection_reason = p_reason, rejected_at = now(), rejected_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    if v_tx.type = 'withdraw' then
      -- Hoàn lại đúng số tiền đã bị giữ lúc tạo lệnh rút
      perform set_config('app.trusted_balance_rpc', 'on', true);
      update public.users set
        balance = greatest(0, balance + v_tx.amount),
        balance_version = balance_version + 1,
        last_active = now()
        where id = v_tx.user_id;

      v_refund_code := 'REF' || to_char(clock_timestamp(), 'FMHH24MISS') || substr(v_tx.id, -4);
      insert into public.wallet_transactions(id, user_id, type, amount, status, description, code)
      values (
        gen_random_uuid()::text, v_tx.user_id, 'deposit', v_tx.amount, 'completed',
        'Hoàn tiền do lệnh rút ' || coalesce(v_tx.code, v_tx.id) || ' bị từ chối: ' || coalesce(p_reason, ''),
        v_refund_code
      );

      v_title := 'Lệnh rút tiền bị từ chối';
      v_content := 'Lệnh rút ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') bị từ chối. Lý do: ' || coalesce(p_reason, '') || '. Số tiền đã được hoàn trả nguyên vẹn vào ví VinClub.';
    else
      v_title := 'Yêu cầu nạp tiền bị từ chối';
      v_content := 'Lệnh nạp ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') bị từ chối. Lý do: ' || coalesce(p_reason, '') || '.';
    end if;
  end if;

  -- Gửi thẳng vào khung chat CSKH của user (đúng quy ước notifyUser.js: mọi
  -- thông tin gắn với 1 tài khoản cụ thể đi qua Message, không qua chuông
  -- thông báo chung), giống hệt telegram_process_wallet_transaction.
  insert into public.messages(id, sender, user_id, conversation_id, content, attachments, created_date)
  values (
    'id_wtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
    'admin', v_tx.user_id, v_tx.user_id, '[' || v_title || ']' || chr(10) || chr(10) || v_content, '[]'::jsonb, now()
  );

  insert into public.audit_logs(id, action, tx_code, amount, user_id, admin_email, notes)
  values (
    gen_random_uuid()::text,
    case when p_action = 'approve' then
      (case when v_tx.type = 'deposit' then 'APPROVE_DEPOSIT' else 'APPROVE_WITHDRAWAL' end)
    else
      (case when v_tx.type = 'deposit' then 'REJECT_DEPOSIT' else 'REJECT_WITHDRAWAL' end)
    end,
    coalesce(v_tx.code, v_tx.id), v_tx.amount, v_tx.user_id, v_admin_email, v_content
  );

  return v_tx;
end;
$function$;

REVOKE ALL ON FUNCTION public.process_wallet_transaction(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_wallet_transaction(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(text, text, text) TO authenticated, service_role;
