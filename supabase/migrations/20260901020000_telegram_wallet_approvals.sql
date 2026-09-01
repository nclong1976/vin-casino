-- Cầu nối Nạp/Rút tiền <-> Telegram: mỗi lệnh nạp/rút mới (status='pending')
-- được forward vào nhóm Telegram kèm 2 nút "Phê duyệt"/"Từ chối" (server.ts).
-- Bảng dưới đây ánh xạ 1 tin nhắn Telegram -> 1 giao dịch ví, và cờ
-- awaiting_custom_reason đánh dấu tin đang chờ Admin REPLY nhập tay lý do từ
-- chối tùy chỉnh. Chỉ service_role (server.ts) đọc/ghi bảng này.
CREATE TABLE public.telegram_wallet_links (
  telegram_message_id bigint PRIMARY KEY,
  tx_id text NOT NULL,
  tx_type text NOT NULL,
  awaiting_custom_reason boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_wallet_links_tx ON public.telegram_wallet_links(tx_id);
ALTER TABLE public.telegram_wallet_links ENABLE ROW LEVEL SECURITY;

-- Xử lý duyệt/từ chối 1 lệnh nạp/rút HOÀN TOÀN nguyên tử (khoá đúng dòng qua
-- FOR UPDATE + status='pending' nên bấm trùng trên Telegram + trong app cùng
-- lúc chỉ 1 lệnh thắng), gọi TRỰC TIẾP từ server.ts qua service_role key
-- (không có phiên đăng nhập admin nào đứng sau nút bấm Telegram, nên hàm
-- KHÔNG dùng is_admin()/auth.uid() như process_withdrawal - thay vào đó chỉ
-- được GRANT cho service_role, và nhận p_admin_label do server.ts tự truyền
-- vào (tên/username Telegram của người bấm nút) để ghi vào audit log).
--
-- QUAN TRỌNG - khác với process_withdrawal(): khi DUYỆT rút tiền, hàm này
-- KHÔNG trừ tiền lần nữa - số dư đã bị trừ ngay lúc user tạo lệnh rút (xem
-- WithdrawModal.jsx: adjustUserBalance(user.id, -numAmount) chạy trước khi
-- tạo dòng wallet_transactions). Chỉ khi TỪ CHỐI mới hoàn lại đúng số đã giữ.
CREATE OR REPLACE FUNCTION public.telegram_process_wallet_transaction(
  p_tx_id text,
  p_action text,
  p_reason text DEFAULT NULL,
  p_admin_label text DEFAULT 'Admin (Telegram)'
)
RETURNS wallet_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tx public.wallet_transactions;
  v_title text;
  v_content text;
  v_refund_code text;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_tx from public.wallet_transactions
  where id = p_tx_id and status = 'pending' and type in ('deposit', 'withdraw')
  for update;

  if not found then
    raise exception 'ALREADY_PROCESSED';
  end if;

  if p_action = 'approve' then
    update public.wallet_transactions set
      status = 'completed', approved_at = now(), approved_by = p_admin_label
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
        ' đã được phê duyệt. Số dư ví được cộng thêm ' || v_tx.amount || ' VNĐ.';
    else
      v_title := 'Biến động số dư: -' || v_tx.amount || ' VNĐ';
      v_content := 'Yêu cầu rút tiền mã ' || coalesce(v_tx.code, v_tx.id) ||
        ' đã được phê duyệt. Tiền đã chuyển về ngân hàng ' ||
        coalesce(v_tx.bank_name, 'đối tác') || ' (' || coalesce(v_tx.account_number, '') || ').';
    end if;
  else
    update public.wallet_transactions set
      status = 'rejected', rejection_reason = p_reason, rejected_at = now(), rejected_by = p_admin_label
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

  -- Gửi thẳng vào khung chat CSKH của user (giống notifyUser.js), không dùng
  -- chuông thông báo chung
  insert into public.messages(id, sender, user_id, conversation_id, content, attachments, created_date)
  values (
    'id_tgwtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
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
    coalesce(v_tx.code, v_tx.id), v_tx.amount, v_tx.user_id, p_admin_label, v_content
  );

  return v_tx;
end;
$function$;

REVOKE ALL ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) TO service_role;
