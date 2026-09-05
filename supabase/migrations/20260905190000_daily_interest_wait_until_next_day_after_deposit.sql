-- Yêu cầu: "Lãi hằng ngày được tính cho người dùng sau 24h kể từ lúc người
-- dùng nạp tiền vào tài khoản" - làm rõ qua trao đổi: giữ nguyên cách tính
-- lãi hiện có (theo %/hạng thẻ trên TOÀN BỘ số dư ví, cộng 1 lần/ngày cố
-- định lúc 9h sáng giờ VN qua credit_daily_interest_batch()), CHỈ đổi mốc
-- được phép nhận lần lãi ĐẦU TIÊN: nạp tiền hôm nay thì sớm nhất 9h sáng
-- NGÀY MAI mới được cộng lãi lần đầu (không phải ngay hôm đó nếu admin bật
-- lãi/nạp tiền trước 9h). Nạp thêm các lần sau KHÔNG đẩy lùi lịch đã có -
-- chỉ mốc nạp tiền ĐẦU TIÊN của mỗi người mới có ý nghĩa.
--
-- Trước đây điều kiện đủ điều kiện chỉ là
-- "last_interest_credited_date IS NULL OR < hôm nay" - một user vừa nạp
-- tiền lần đầu trong ngày, nếu được admin bật lãi ngay, vẫn được cộng lãi
-- ngay trong chính ngày đó (nếu cron chạy sau 9h) - không đúng ý "phải chờ
-- qua ngày hôm sau".

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_deposit_date date;

COMMENT ON COLUMN public.users.first_deposit_date IS 'Ngày (giờ VN) của lần nạp tiền ĐẦU TIÊN được duyệt - dùng làm mốc "chờ qua ngày hôm sau" cho lần cộng lãi hàng ngày đầu tiên (credit_daily_interest_batch). Chỉ ghi 1 lần (COALESCE trong process_wallet_transaction/telegram_process_wallet_transaction) - nạp thêm các lần sau không đổi giá trị này.';

-- Bù dữ liệu cho user đã có lịch sử nạp tiền từ trước migration này, để
-- không làm gián đoạn/mất lãi của những người đang nhận lãi hiện tại.
UPDATE public.users u
SET first_deposit_date = sub.first_dep
FROM (
  SELECT user_id, MIN((created_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS first_dep
  FROM public.wallet_transactions
  WHERE type = 'deposit' AND status IN ('approved', 'completed')
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id AND u.first_deposit_date IS NULL;

-- Ghi nhận mốc nạp tiền đầu tiên NGAY tại nơi tiền thực sự được cộng vào ví
-- (duyệt trong app). COALESCE đảm bảo chỉ ghi đúng 1 lần - nạp thêm sau
-- không đẩy lùi lịch.
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
        last_active = now(),
        first_deposit_date = coalesce(first_deposit_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        where id = v_tx.user_id;

      v_title := 'Biến động số dư: +' || v_tx.amount || ' VNĐ';
      v_content := 'Yêu cầu nạp tiền mã ' || coalesce(v_tx.code, v_tx.id) ||
        ' đã được Quản trị viên phê duyệt. Số dư ví được cộng thêm ' || v_tx.amount || ' VNĐ.';
    else
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

-- Cùng thay đổi cho đường duyệt qua Telegram (dùng chung logic cộng tiền
-- nạp với process_wallet_transaction ở trên - phải sửa đồng bộ cả 2 nơi).
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
        last_active = now(),
        first_deposit_date = coalesce(first_deposit_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
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

-- Thêm đúng 1 điều kiện còn thiếu vào bộ lọc "đủ điều kiện nhận lãi hôm
-- nay" - không đổi công thức tính %/hạng thẻ hay bất kỳ logic nào khác.
CREATE OR REPLACE FUNCTION public.credit_daily_interest_batch()
 RETURNS TABLE(user_id text, credited_amount bigint, new_balance bigint, tier_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vn_date date;
  v_vn_hour numeric;
BEGIN
  -- Mọi mốc "ngày" và "giờ" trong hàm này tính theo giờ Việt Nam
  -- (Asia/Ho_Chi_Minh, UTC+7, không có DST) - KHÔNG dùng CURRENT_DATE/now()
  -- mặc định vì Postgres server chạy theo UTC, lệch 7 tiếng so với giờ VN sẽ
  -- khiến "ngày" đổi sai thời điểm và mốc 9h sáng bị tính nhầm.
  v_vn_date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_vn_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'));

  -- Trước 9h sáng giờ VN: chưa tới giờ cộng lãi hôm nay, không làm gì cả.
  -- Hàm này được server gọi định kỳ (server.ts, mỗi 15 phút) nên tự thoát
  -- sớm ở đây an toàn - không cần cron riêng theo giờ VN phía server.
  IF v_vn_hour < 9 THEN
    RETURN;
  END IF;

  PERFORM set_config('app.trusted_balance_rpc', 'on', true);

  RETURN QUERY
  WITH eligible AS (
    SELECT u.id, u.balance,
      CASE
        WHEN u.membership_tier ILIKE '%diamond%' OR u.membership_tier ILIKE '%kim cương%' THEN 0.012
        WHEN u.membership_tier ILIKE '%platinum%' OR u.membership_tier ILIKE '%bạch kim%' THEN 0.008
        WHEN u.membership_tier ILIKE '%gold%' OR u.membership_tier ILIKE '%vàng%' THEN 0.004
        ELSE 0.002
      END AS rate
    FROM public.users u
    WHERE u.daily_interest_enabled = true
      AND u.is_locked = false
      AND (u.last_interest_credited_date IS NULL OR u.last_interest_credited_date < v_vn_date)
      -- Mới: nạp tiền lần đầu HÔM NAY (hoặc chưa từng nạp) thì chưa đủ điều
      -- kiện - phải qua ít nhất 1 ngày kể từ lần nạp đầu tiên mới được nhận
      -- lãi lần đầu, đúng yêu cầu "sau 24h kể từ lúc nạp tiền" (làm tròn
      -- theo mốc 9h sáng cố định sẵn có, không đổi giờ cộng lãi trong ngày).
      AND u.first_deposit_date IS NOT NULL
      AND u.first_deposit_date < v_vn_date
    FOR UPDATE OF u SKIP LOCKED
  ),
  computed AS (
    SELECT id, rate, FLOOR(balance * rate)::bigint AS amount
    FROM eligible
    WHERE FLOOR(balance * rate)::bigint > 0
  ),
  updated AS (
    UPDATE public.users u
    SET balance = u.balance + c.amount,
        balance_version = u.balance_version + 1,
        last_interest_credited_date = v_vn_date
    FROM computed c
    WHERE u.id = c.id
    RETURNING u.id, c.amount AS credited_amount, u.balance AS new_balance, c.rate AS tier_rate
  ),
  logged AS (
    INSERT INTO public.wallet_transactions (id, user_id, type, amount, status, category, note, code, created_date)
    SELECT
      'wtx_int_' || up.id || '_' || to_char(v_vn_date, 'YYYYMMDD'),
      up.id,
      'bonus',
      up.credited_amount,
      'approved',
      'Lãi Hàng Ngày Theo Cấp VIP',
      'Lãi ngày ' || to_char(v_vn_date, 'DD/MM/YYYY') || ' (' || (up.tier_rate * 100) || '%/ngày, cộng lúc 9h sáng giờ VN) [ref:interest:' || up.id || ':' || to_char(v_vn_date, 'YYYYMMDD') || ']',
      'LAI' || to_char(v_vn_date, 'YYYYMMDD') || upper(right(up.id, 6)),
      now()
    FROM updated up
    ON CONFLICT (id) DO NOTHING
  )
  SELECT * FROM updated;
END;
$function$;
