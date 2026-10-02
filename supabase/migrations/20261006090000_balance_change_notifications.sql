-- Mọi thay đổi số dư của người dùng đều có thông báo "Biến động số dư" ở
-- chuông (kiểu tin nhắn ngân hàng), và mọi thông báo ở chuông của người dùng
-- đều được đẩy (Web Push) lên điện thoại đã bật thông báo.
--
-- 1) Trigger trên users.balance (thay cho việc từng nơi tự tạo thông báo):
--    - trg_balance_change_capture (ngay lập tức): nhớ số dư TRƯỚC thay đổi
--      đầu tiên trong giao dịch + câu lệnh gây ra thay đổi.
--    - trg_balance_change_notice (deferred, lúc COMMIT): 1 thông báo / người /
--      giao dịch với số tiền ròng, SD = số dư sau giao dịch, ND theo nguồn.
--    Không báo: trò chơi (kết quả đã hiện trên màn chơi - theo yêu cầu), giao
--    dịch đã tự tạo thông báo biến động (duyệt nạp tiền), memo = 'skip'.
-- 2) increment_user_balance_noted(): như increment_user_balance nhưng kèm
--    nội dung ND do ứng dụng truyền (đầu tư dự án, rút tiền, cổ phiếu, Admin).
-- 3) Duyệt lệnh rút: tiền đã trừ (và đã báo biến động) lúc tạo lệnh, nên
--    thông báo lúc duyệt đổi thành "Lệnh rút tiền đã hoàn tất" để không báo
--    trừ tiền 2 lần.
-- 4) Web Push: trigger trên notifications đẩy MỌI thông báo của người dùng
--    (trừ thông báo nội bộ cho Admin), không chỉ thông báo văn bản.

-- ─── Nội dung chuyển khoản kiểu ngân hàng: bỏ dấu, viết hoa ──────────────
CREATE OR REPLACE FUNCTION public.vn_bank_memo(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  select left(upper(btrim(regexp_replace(translate(coalesce(p, ''),
    'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'),
    '\s+', ' ', 'g'))), 160);
$$;

-- ─── 1) Cộng/trừ số dư kèm nội dung ND ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_user_balance_noted(
  p_user_id text, p_delta bigint, p_total_deposited_delta bigint DEFAULT 0, p_memo text DEFAULT NULL)
RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  perform set_config('app.balance_memo', left(coalesce(p_memo, ''), 200), true);
  -- Quyền (chủ tài khoản chỉ được trừ, Admin cộng/trừ) do increment_user_balance kiểm tra.
  return query select * from public.increment_user_balance(p_user_id, p_delta, p_total_deposited_delta);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_user_balance_noted(text, bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_user_balance_noted(text, bigint, bigint, text) TO authenticated;

-- ─── 2) Trigger biến động số dư ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.balance_change_capture()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  k text := 'app.bal_old_' || md5(new.id);
begin
  if coalesce(current_setting(k, true), '') = '' then
    perform set_config(k, old.balance::text, true);
  end if;
  if coalesce(current_setting('app.balance_source', true), '') = '' then
    perform set_config('app.balance_source', left(coalesce(current_query(), ''), 1000), true);
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.balance_change_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  k text := 'app.bal_old_' || md5(new.id);
  v_old text := current_setting(k, true);
  v_src text := lower(coalesce(current_setting('app.balance_source', true), ''));
  v_memo text := coalesce(current_setting('app.balance_memo', true), '');
  v_cur numeric;
  v_identifier text;
  v_email text;
  v_delta numeric;
  v_vn timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  if coalesce(v_old, '') = '' then
    return null; -- đã xử lý ở sự kiện trước của cùng người trong giao dịch này
  end if;
  perform set_config(k, '', true);

  select u.balance, u.identifier, u.email into v_cur, v_identifier, v_email
    from public.users u where u.id = new.id;
  if not found then
    return null;
  end if;
  v_delta := v_cur - v_old::numeric;
  if v_delta = 0 or v_memo = 'skip' then
    return null;
  end if;

  -- Trò chơi: không báo (kết quả mỗi ván đã hiện trên màn hình chơi).
  if v_src ~ '(place_tiger_baccarat_bet|resolve_tiger_baccarat_round|play_baicao_round|start_xitobala_round|raise_xitobala_round|reveal_xitobala_round|spin_lucky_wheel|reconcile_my_stale_casino_round)' then
    return null;
  end if;

  -- Giao dịch đã tự tạo thông báo biến động (process_wallet_transaction duyệt nạp).
  if exists (
    select 1 from public.notifications n
     where n.user_id = new.id and n.title = 'Biến động số dư' and n.xmin = pg_current_xact_id()::xid
  ) then
    return null;
  end if;

  v_memo := coalesce(nullif(public.vn_bank_memo(v_memo), ''), case
    when v_src ~ 'credit_daily_interest_batch' then 'LAI DAU TU HANG NGAY'
    when v_src ~ 'disburse_daily_investment_payouts' then 'CHI TRA LAI DAU TU'
    when v_src ~ '(resolve_project_maturity_payout|settle_matured_investments)' then 'TAT TOAN DAU TU GOC VA LAI'
    when v_src ~ 'contribute_to_savings_goal' then 'NOP QUY TIET KIEM'
    when v_src ~ '(withdraw_from_savings_goal|delete_savings_goal)' then 'RUT QUY TIET KIEM'
    when v_src ~ 'process_wallet_transaction' then 'HOAN TIEN LENH RUT BI TU CHOI'
    when v_src ~ 'set_user_balance_absolute' then 'VINCLUB DIEU CHINH SO DU'
    when v_delta > 0 then 'CT CP VINCLUB CHUYEN TIEN'
    else 'VINCLUB GIAO DICH'
  end);

  insert into public.notifications (id, user_id, title, content, type, is_read, created_date)
  values (
    'ntf_bal_' || replace(gen_random_uuid()::text, '-', ''),
    new.id,
    'Biến động số dư',
    'TK ' || coalesce(nullif(btrim(v_identifier), ''), nullif(split_part(coalesce(v_email, ''), '@', 1), ''), new.id) ||
      ': ' || case when v_delta > 0 then '+' else '-' end ||
      to_char(abs(v_delta), 'FM999,999,999,999,999') || ' VND luc ' || to_char(v_vn, 'HH24:MI DD/MM/YYYY') ||
      '. SD: ' || to_char(v_cur, 'FM999,999,999,999,999') || ' VND. ND: ' || v_memo,
    case when v_delta > 0 then 'deposit' else 'withdraw' end,
    false,
    now()
  );
  return null;
exception when others then
  -- Thông báo là phụ: không được làm hỏng giao dịch tiền.
  raise warning 'balance_change_notice: %', sqlerrm;
  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.balance_change_notice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_balance_change_capture ON public.users;
CREATE TRIGGER trg_balance_change_capture
  AFTER UPDATE OF balance ON public.users
  FOR EACH ROW
  WHEN (old.balance IS DISTINCT FROM new.balance)
  EXECUTE FUNCTION public.balance_change_capture();

DROP TRIGGER IF EXISTS trg_balance_change_notice ON public.users;
CREATE CONSTRAINT TRIGGER trg_balance_change_notice
  AFTER UPDATE OF balance ON public.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (old.balance IS DISTINCT FROM new.balance)
  EXECUTE FUNCTION public.balance_change_notice();

-- ─── 3) Duyệt lệnh rút: không báo trừ tiền lần 2 ──────────────────────────
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
      -- Rút tiền: số dư đã bị trừ (và đã báo "Biến động số dư") lúc tạo lệnh.
      v_title := 'Lệnh rút tiền đã hoàn tất';
      v_content := 'Dạ lệnh rút ' || to_char(v_tx.amount, 'FM999,999,999,999') || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách đã được duyệt và chuyển khoản về ' ||
        coalesce(nullif(v_tx.bank_name, ''), 'tài khoản ngân hàng') ||
        coalesce(' (•••• ' || nullif(right(coalesce(v_tx.account_number, ''), 4), '') || ')', '') ||
        ' thành công. Quý khách vui lòng kiểm tra tài khoản ngân hàng ạ.';
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

-- ─── 4) Web Push cho mọi thông báo của người dùng ─────────────────────────
-- Giữ tên trigger/hàm cũ (đã gắn trên production). Thông báo nội bộ cho
-- Admin (type 'admin' / user_id 'admin') đã có admin-push-send riêng.
CREATE OR REPLACE FUNCTION public.esign_push_document_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_base text;
  v_secret text;
  v_messages jsonb;
  v_chunk jsonb;
  v_n integer;
  v_i integer := 0;
begin
  if not exists (select 1 from new_rows n where coalesce(n.type, '') <> 'admin' and coalesce(n.user_id, '') <> 'admin') then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', n.user_id,
           'title', n.title,
           'body', n.content,
           'url', case when n.type = 'document' and n.extra ? 'document_id' then '/document/' || (n.extra->>'document_id') else '/' end,
           'tag', case when n.type = 'document' and n.extra ? 'document_id' then 'document-' || (n.extra->>'document_id') else 'ntf-' || n.id end)), '[]'::jsonb)
    into v_messages
    from new_rows n
    left join public.custom_documents d on n.type = 'document' and d.id = n.extra->>'document_id'
    left join public.document_campaigns c on n.type = 'document' and c.id = coalesce(d.campaign_id, n.extra->>'campaign_id')
   where coalesce(n.type, '') <> 'admin'
     and coalesce(n.user_id, '') <> 'admin'
     and coalesce((c.delivery_settings -> 'channels' ->> 'push')::boolean, true)
     and exists (select 1 from public.user_push_subscriptions s where s.user_id = n.user_id);

  v_n := jsonb_array_length(v_messages);
  if v_n = 0 then
    return null;
  end if;

  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'esign_functions_base_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'esign_internal_secret' limit 1;
  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  while v_i < v_n loop
    select jsonb_agg(m) into v_chunk
      from (select m from jsonb_array_elements(v_messages) with ordinality as e(m, i) where i > v_i and i <= v_i + 200) s;
    perform net.http_post(
      url := rtrim(v_base, '/') || '/user-push-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
      body := jsonb_build_object('messages', v_chunk),
      timeout_milliseconds := 10000
    );
    v_i := v_i + 200;
  end loop;
  return null;
exception when others then
  raise warning 'esign_push_document_notifications: %', sqlerrm;
  return null;
end;
$function$;
