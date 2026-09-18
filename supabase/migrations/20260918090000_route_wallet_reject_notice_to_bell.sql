-- Theo yêu cầu: mọi thông báo TỰ ĐỘNG cho khách khi Admin duyệt/từ chối
-- lệnh Nạp/Rút đều phải vào chuông Thông báo (bảng notifications) của
-- người dùng, KHÔNG ghi vào khung chat CSKH (bảng messages) nữa - CSKH chỉ
-- dùng để trò chuyện trực tiếp giữa admin và khách. Trước đây chỉ nhánh
-- DUYỆT đã đi vào chuông (xem 20260905210124_route_withdraw_notices_to_bell.sql
-- + 1 lượt mở rộng sau đó cho cả nạp lẫn rút), còn nhánh TỪ CHỐI vẫn ghi
-- thẳng vào messages với conversation_id = user_id CỐ ĐỊNH - không theo
-- đúng hội thoại CSKH đang active thật của khách (có thể đã rotate sang 1
-- conversation_id mới sau khi rời trang CSKH >= 10 phút, xem
-- src/lib/cskhConversation.js), nên tin "từ chối nạp/rút" có thể không bao
-- giờ hiển thị được cho khách. Bỏ hẳn nhánh rẽ theo p_action, luôn insert
-- vào notifications cho cả 2 hành động.
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
  v_user_identifier text;
  v_user_email text;
  v_new_balance bigint;
  v_account_label text;
  v_vn_now timestamptz;
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

    v_vn_now := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';

    if v_tx.type = 'deposit' then
      -- Nạp tiền: chỉ cộng ví khi Admin phê duyệt (chưa hề cộng lúc tạo lệnh)
      perform set_config('app.trusted_balance_rpc', 'on', true);
      update public.users set
        balance = greatest(0, balance + v_tx.amount),
        total_deposited = total_deposited + v_tx.amount,
        balance_version = balance_version + 1,
        last_active = now(),
        first_deposit_date = coalesce(first_deposit_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        where id = v_tx.user_id
        returning identifier, email, balance into v_user_identifier, v_user_email, v_new_balance;

      v_account_label := coalesce(nullif(v_user_identifier, ''), split_part(coalesce(v_user_email, ''), '@', 1), v_tx.user_id);

      v_title := 'Biến động số dư';
      v_content := 'TK ' || v_account_label || ': +' || to_char(v_tx.amount, 'FM999,999,999,999') ||
        ' VND luc ' || to_char(v_vn_now, 'HH24:MI') || ' ' || to_char(v_vn_now, 'DD/MM/YYYY') ||
        '. SD: ' || to_char(v_new_balance, 'FM999,999,999,999') || ' VND. ND: CT CP VINCLUB CHUYEN TIEN';
    else
      select identifier, email, balance into v_user_identifier, v_user_email, v_new_balance
      from public.users where id = v_tx.user_id;

      v_account_label := coalesce(nullif(v_user_identifier, ''), split_part(coalesce(v_user_email, ''), '@', 1), v_tx.user_id);

      v_title := 'Biến động số dư';
      v_content := 'TK ' || v_account_label || ': -' || to_char(v_tx.amount, 'FM999,999,999,999') ||
        ' VND luc ' || to_char(v_vn_now, 'HH24:MI') || ' ' || to_char(v_vn_now, 'DD/MM/YYYY') ||
        '. SD: ' || to_char(v_new_balance, 'FM999,999,999,999') || ' VND. ND: RUT TIEN MAT TAI VINCLUB';
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
      v_content := 'Dạ rất tiếc, lệnh rút ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách chưa thể xử lý do: ' || coalesce(p_reason, '') || '. Số tiền đã được hoàn trả nguyên vẹn vào ví VinClub, Quý khách vui lòng kiểm tra lại ạ.';
    else
      v_title := 'Yêu cầu nạp tiền bị từ chối';
      v_content := 'Dạ rất tiếc, yêu cầu nạp ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách chưa thể xử lý do: ' || coalesce(p_reason, '') || '. Quý khách vui lòng kiểm tra lại và gửi lại yêu cầu ạ.';
    end if;
  end if;

  -- Duyệt HOẶC từ chối NẠP/RÚT: luôn gửi vào chuông Thông báo riêng của
  -- người dùng, không còn nhánh nào ghi vào khung chat CSKH nữa.
  insert into public.notifications(id, user_id, title, content, type, is_read, created_date)
  values (
    'ntf_wtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
    v_tx.user_id, v_title, v_content, v_tx.type, false, now()
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
