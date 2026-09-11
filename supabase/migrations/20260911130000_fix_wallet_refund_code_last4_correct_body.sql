-- SỬA LẠI migration trước (20260911120000_fix_telegram_refund_code_last4.sql):
-- migration đó vô tình lấy THÂN HÀM CŨ của telegram_process_wallet_transaction()
-- từ 20260901020000_telegram_wallet_approvals.sql để áp fix substr(-4) -> right(),
-- trong khi bản đang chạy thật (được CREATE OR REPLACE lần cuối bởi
-- 20260906000000_all_balance_change_notices_to_bell.sql) đã khác nhiều: gửi
-- thông báo qua chuông (bảng notifications) thay vì chat CSKH khi DUYỆT, nội
-- dung theo style SMS ngân hàng, có set first_deposit_date, tra identifier/
-- email để hiển thị "TK ...". Nếu chạy migration trước lên DB thật, hàm sẽ bị
-- LÙI về hành vi cũ (mất toàn bộ các thay đổi từ 20260905193000 đến
-- 20260906000000). Migration này CREATE OR REPLACE lại đúng theo thân hàm mới
-- nhất, chỉ sửa substr(v_tx.id, -4) -> right(v_tx.id, 4) như dự định ban đầu.
--
-- Đồng thời sửa CÙNG lỗi substr(-4) trong process_wallet_transaction() (RPC
-- dùng bởi admin duyệt nạp/rút ngay trong app, không qua Telegram) - lỗi này
-- chưa từng được migration nào trước đó sửa.
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

      v_refund_code := 'REF' || to_char(clock_timestamp(), 'FMHH24MISS') || right(v_tx.id, 4);
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

  if p_action = 'approve' then
    -- Duyệt NẠP hoặc RÚT: gửi thẳng chuông thông báo riêng của người dùng
    -- thay vì khung chat CSKH.
    insert into public.notifications(id, user_id, title, content, type, is_read, created_date)
    values (
      'ntf_wtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
      v_tx.user_id, v_title, v_content, v_tx.type, false, now()
    );
  else
    insert into public.messages(id, sender, user_id, conversation_id, content, attachments, created_date)
    values (
      'id_wtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
      'admin', v_tx.user_id, v_tx.user_id, '[' || v_title || ']' || chr(10) || chr(10) || v_content, '[]'::jsonb, now()
    );
  end if;

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
  v_user_identifier text;
  v_user_email text;
  v_new_balance bigint;
  v_account_label text;
  v_vn_now timestamptz;
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

      v_refund_code := 'REF' || to_char(clock_timestamp(), 'FMHH24MISS') || right(v_tx.id, 4);
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

  if p_action = 'approve' then
    -- Duyệt NẠP hoặc RÚT: gửi thẳng chuông thông báo riêng của người dùng
    -- thay vì khung chat CSKH.
    insert into public.notifications(id, user_id, title, content, type, is_read, created_date)
    values (
      'ntf_tgwtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
      v_tx.user_id, v_title, v_content, v_tx.type, false, now()
    );
  else
    insert into public.messages(id, sender, user_id, conversation_id, content, attachments, created_date)
    values (
      'id_tgwtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
      'admin', v_tx.user_id, v_tx.user_id, '[' || v_title || ']' || chr(10) || chr(10) || v_content, '[]'::jsonb, now()
    );
  end if;

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

REVOKE ALL ON FUNCTION public.process_wallet_transaction(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_wallet_transaction(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telegram_process_wallet_transaction(text, text, text, text) TO service_role;
