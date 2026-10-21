-- RPC tạo lệnh rút tiền NGUYÊN TỬ: trừ số dư + tạo lệnh rút trong CÙNG MỘT
-- giao dịch. Nếu bất kỳ bước nào lỗi (vd trigger hạn mức ngày từ chối), toàn
-- bộ rollback -> KHÔNG BAO GIỜ rơi vào trạng thái "đã trừ tiền nhưng không
-- tạo được lệnh" (lỗi mất tiền tiềm ẩn ở luồng cũ: client trừ tiền trước rồi
-- mới insert, insert lỗi thì tiền không được hoàn vì RPC cấm người dùng tự
-- cộng lại ví mình).
--
-- Chạy dưới quyền người dùng (auth.uid). Kiểm tra: đăng nhập, số tiền tối
-- thiểu, có ngân hàng nhận, tài khoản không bị khóa, đủ số dư. Khóa dòng
-- users FOR UPDATE để tránh race khi 2 thiết bị rút cùng lúc.

CREATE OR REPLACE FUNCTION public.request_withdraw(
  p_amount bigint,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_code text DEFAULT NULL
)
RETURNS public.wallet_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_balance bigint;
  v_locked boolean;
  v_code text;
  v_tx public.wallet_transactions;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(p_amount, 0) < 100000 then
    raise exception 'WITHDRAW_MIN: Số tiền rút tối thiểu là 100.000 VNĐ';
  end if;
  if coalesce(btrim(p_bank_name), '') = '' then
    raise exception 'WITHDRAW_NO_BANK: Vui lòng chọn ngân hàng nhận tiền';
  end if;

  -- Khóa dòng để đọc số dư chính xác và tránh rút chồng.
  select balance, is_locked into v_balance, v_locked
    from public.users where id = v_uid for update;
  if not found then
    raise exception 'user not found';
  end if;
  if v_locked then
    raise exception 'ACCOUNT_LOCKED: Tài khoản đang bị tạm khóa';
  end if;
  if p_amount > v_balance then
    raise exception 'INSUFFICIENT_BALANCE: Số dư khả dụng không đủ';
  end if;

  v_code := coalesce(nullif(btrim(p_code), ''), 'VCW' || to_char(clock_timestamp(), 'FMYYYYMMDDHH24MISS'));

  -- Trừ tiền (được phép ghi field balance qua cờ tin cậy). Cùng transaction
  -- với insert bên dưới nên hoặc cả hai thành công, hoặc cả hai rollback.
  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
     set balance = balance - p_amount,
         balance_version = balance_version + 1,
         last_active = now()
   where id = v_uid;

  -- Tạo lệnh rút. Trigger enforce_withdraw_daily_limit sẽ kiểm tra hạn mức
  -- ngày theo hạng; nếu vượt -> RAISE -> rollback cả lệnh trừ tiền ở trên.
  insert into public.wallet_transactions(
    id, user_id, type, amount, bank_name, account_number, account_holder,
    status, description, code
  )
  values (
    gen_random_uuid()::text, v_uid, 'withdraw', p_amount,
    p_bank_name, p_account_number, p_account_holder,
    'pending',
    'Lệnh rút tiền về ' || coalesce(p_bank_name, '') || ' (' || v_code || ')',
    v_code
  )
  returning * into v_tx;

  return v_tx;
end;
$function$;

REVOKE ALL ON FUNCTION public.request_withdraw(bigint, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdraw(bigint, text, text, text, text) TO authenticated;
