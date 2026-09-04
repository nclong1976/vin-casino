-- Chuyển mô hình trả lãi từ "gộp cả gốc + lãi 1 lần khi đáo hạn" sang
-- "giải ngân lãi từng ngày, hoàn gốc ở ngày cuối" - CHỈ áp dụng cho 2 hạng
-- mục VinHomes và Đầu tư nghỉ dưỡng (Dự Án/Đầu tư chứng khoán giữ nguyên cơ
-- chế cũ, không đổi gì). Xem thiết kế đầy đủ + lý do grandfather giao dịch
-- VinHomes đang ACTIVE thật trong plan đã duyệt.
--
-- 1 giao dịch VinHomes ACTIVE thật (606.627.634đ) đã ký hợp đồng dưới điều
-- khoản "trả 1 lần" - KHÔNG được đổi mô hình sau khi đã ký. Cột
-- payout_model mới có DEFAULT 'LUMP_SUM' nên giao dịch cũ này tự động giữ
-- nguyên cơ chế cũ mà không cần backfill riêng; trigger
-- compute_transaction_interest() chỉ gán 'DAILY_ACCRUAL' cho giao dịch MỚI
-- tạo sau migration này, đúng theo category tại thời điểm đầu tư.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payout_model text NOT NULL DEFAULT 'LUMP_SUM'
    CHECK (payout_model IN ('LUMP_SUM', 'DAILY_ACCRUAL')),
  ADD COLUMN IF NOT EXISTS daily_payout_days_paid integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transactions.payout_model IS 'LUMP_SUM: gộp gốc+lãi 1 lần khi đáo hạn (Dự Án/Chứng khoán, và mọi giao dịch tạo trước 2026-09-04). DAILY_ACCRUAL: giải ngân lãi từng ngày, gốc hoàn ở ngày cuối (VinHomes/Nghỉ dưỡng, giao dịch tạo từ nay). Gán 1 lần lúc tạo giao dịch, không đổi lại sau đó.';
COMMENT ON COLUMN public.transactions.daily_payout_days_paid IS 'Số ngày đã giải ngân (chỉ có ý nghĩa với payout_model=DAILY_ACCRUAL) - disburse_daily_investment_payouts() dùng để biết đã trả tới ngày nào, tránh trả trùng.';

CREATE OR REPLACE FUNCTION public.compute_transaction_interest()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_project record;
begin
  if new.project_id is not null then
    select * into v_project from public.investment_projects where id = new.project_id;
  end if;

  if v_project.id is null then
    raise exception 'compute_transaction_interest: invalid or missing project_id';
  end if;

  new.rate := v_project.total_term_interest_rate;
  new.profit := round(coalesce(new.amount, 0) * v_project.total_term_interest_rate / 100);
  new.total := coalesce(new.amount, 0) + new.profit;
  new.created_date := coalesce(new.created_date, now());
  new.matures_at := new.created_date + make_interval(mins => v_project.term_duration_minutes);
  new.interest_status := 'pending';
  new.payout_status := coalesce(new.payout_status, 'pending');
  new.status := coalesce(new.status, 'completed');
  new.payout_model := case
    when v_project.category in ('VinHomes', 'Đầu tư nghỉ dưỡng') then 'DAILY_ACCRUAL'
    else 'LUMP_SUM'
  end;

  return new;
end;
$function$;

-- 2 hàm cũ chỉ thêm đúng 1 điều kiện lọc "payout_model = 'LUMP_SUM'" - không
-- đổi logic nào khác, Dự Án/Chứng khoán chạy y hệt trước giờ.
CREATE OR REPLACE FUNCTION public.settle_matured_investments()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx record;
  v_payout bigint;
  v_count integer := 0;
begin
  perform set_config('app.trusted_balance_rpc', 'on', true);

  for v_tx in
    select * from public.transactions
    where payout_status is distinct from 'paid'
      and status is distinct from 'completed_payout'
      and matures_at is not null
      and matures_at <= now()
      and payout_model = 'LUMP_SUM'
    for update skip locked
  loop
    v_payout := round(coalesce(nullif(v_tx.total, 0), coalesce(v_tx.amount, 0) + coalesce(v_tx.profit, 0)));
    if v_payout <= 0 then
      continue;
    end if;

    update public.transactions
      set status = 'completed_payout', payout_status = 'paid', interest_status = 'completed'
      where id = v_tx.id;

    insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
    values (
      gen_random_uuid()::text, v_tx.user_id, 'deposit', v_payout, 'approved',
      'Đáo Hạn Dự Án',
      'Đáo hạn dự án "' || coalesce(v_tx.project_title, '') || '" - Hoàn vốn & trả lãi [ref:' || v_tx.id || ']'
    );

    update public.users
      set balance = greatest(0, balance + v_payout),
          balance_version = balance_version + 1,
          last_active = now()
      where id = v_tx.user_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_project_maturity_payout(p_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_tx record;
  v_payout bigint;
  v_new_balance bigint;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then
    return jsonb_build_object('paid', false, 'reason', 'not_found');
  end if;

  if v_tx.user_id is distinct from v_user_id and not public.is_admin() then
    raise exception 'not authorized for this transaction';
  end if;

  if v_tx.payout_model <> 'LUMP_SUM' then
    return jsonb_build_object('paid', false, 'reason', 'not_lump_sum');
  end if;

  if v_tx.payout_status = 'paid' or v_tx.status = 'completed_payout' then
    return jsonb_build_object('paid', false, 'reason', 'already_paid');
  end if;

  if v_tx.matures_at is null or now() < v_tx.matures_at then
    return jsonb_build_object('paid', false, 'reason', 'not_matured');
  end if;

  v_payout := round(coalesce(nullif(v_tx.total, 0), coalesce(v_tx.amount, 0) + coalesce(v_tx.profit, 0)));
  if v_payout <= 0 then
    return jsonb_build_object('paid', false, 'reason', 'zero_payout');
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);

  update public.transactions
    set status = 'completed_payout', payout_status = 'paid', interest_status = 'completed'
    where id = p_tx_id;

  insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
  values (
    gen_random_uuid()::text, v_tx.user_id, 'deposit', v_payout, 'approved',
    'Đáo Hạn Dự Án',
    'Đáo hạn dự án "' || coalesce(v_tx.project_title, '') || '" - Hoàn vốn & trả lãi [ref:' || p_tx_id || ']'
  );

  update public.users
    set balance = greatest(0, balance + v_payout),
        balance_version = balance_version + 1,
        last_active = now()
    where id = v_tx.user_id
    returning balance, balance_version into v_new_balance, v_new_version;

  return jsonb_build_object(
    'paid', true,
    'payout_amount', v_payout,
    'project_title', v_tx.project_title,
    'balance', v_new_balance,
    'balance_version', v_new_version
  );
end;
$function$;

-- Cron mới: giải ngân lãi từng ngày cho giao dịch DAILY_ACCRUAL. Cùng mẫu
-- khoá dòng (FOR UPDATE SKIP LOCKED) + ghi wallet_transactions với id CỐ
-- ĐỊNH (wtx_daily_<tx_id>_<ngày>) + ON CONFLICT DO NOTHING như
-- settle_matured_investments()/credit_daily_interest_batch() - chạy lại
-- bao nhiêu lần cũng không trả trùng. Dùng lại đúng v_tx.profit (đã tính
-- sẵn lúc tạo giao dịch bởi compute_transaction_interest, đúng bằng
-- amount * total_term_interest_rate / 100 tại THỜI ĐIỂM ĐẦU TƯ) làm
-- totalInterest, KHÔNG tính lại từ investment_projects.total_term_interest_rate
-- hiện tại - tránh lệch nếu admin sửa lãi suất dự án sau khi giao dịch đã
-- ký. Chia đều dailyBase = floor(profit/cycleDays), số dư lẻ dồn vào ngày
-- cuối - đúng công thức đã kiểm chứng ở src/lib/dailyPayoutEngine/calculations.ts.
CREATE OR REPLACE FUNCTION public.disburse_daily_investment_payouts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx record;
  v_project record;
  v_cycle_days integer;
  v_total_interest bigint;
  v_daily_base bigint;
  v_remainder bigint;
  v_elapsed_days integer;
  v_target_day integer;
  v_day integer;
  v_day_amount bigint;
  v_is_final boolean;
  v_count integer := 0;
begin
  perform set_config('app.trusted_balance_rpc', 'on', true);

  for v_tx in
    select * from public.transactions
    where payout_model = 'DAILY_ACCRUAL'
      and payout_status is distinct from 'paid'
      and status is distinct from 'completed_payout'
    for update skip locked
  loop
    select * into v_project from public.investment_projects where id = v_tx.project_id;
    if v_project.id is null then
      continue;
    end if;

    v_cycle_days := greatest(1, floor(coalesce(v_project.term_duration_minutes, 1440) / 1440.0)::int);
    v_total_interest := coalesce(v_tx.profit, 0)::bigint;
    v_daily_base := v_total_interest / v_cycle_days;
    v_remainder := v_total_interest - v_daily_base * v_cycle_days;

    v_elapsed_days := greatest(0, floor(extract(epoch from (now() - v_tx.created_date)) / 86400)::int);
    v_target_day := least(v_elapsed_days, v_cycle_days);

    if v_target_day <= v_tx.daily_payout_days_paid then
      continue;
    end if;

    for v_day in (v_tx.daily_payout_days_paid + 1)..v_target_day loop
      v_is_final := (v_day = v_cycle_days);
      v_day_amount := v_daily_base
        + (case when v_is_final then v_remainder else 0 end)
        + (case when v_is_final then coalesce(v_tx.amount, 0)::bigint else 0 end);

      insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
      values (
        'wtx_daily_' || v_tx.id || '_' || v_day,
        v_tx.user_id, 'deposit', v_day_amount, 'approved',
        'Lãi Ngày Dự Án',
        'Giải ngân ngày ' || v_day || '/' || v_cycle_days || ' - dự án "' || coalesce(v_tx.project_title, '') || '"'
          || (case when v_is_final then ' (kèm hoàn vốn gốc - đáo hạn)' else '' end)
          || ' [ref:' || v_tx.id || ']'
      )
      on conflict (id) do nothing;

      -- INSERT ... ON CONFLICT DO NOTHING đặt FOUND=false nếu bị chặn trùng
      -- (dòng đã tồn tại từ lần chạy trước) - chỉ cộng số dư khi THỰC SỰ
      -- vừa ghi thêm được 1 dòng mới, tránh cộng 2 lần nếu hàm này bị chạy
      -- lại giữa chừng (vd. lỗi mạng) sau khi đã insert nhưng trước khi kịp
      -- cập nhật daily_payout_days_paid bên dưới.
      if found then
        update public.users
          set balance = greatest(0, balance + v_day_amount),
              balance_version = balance_version + 1,
              last_active = now()
          where id = v_tx.user_id;
      end if;
    end loop;

    update public.transactions
      set daily_payout_days_paid = v_target_day,
          payout_status = case when v_target_day >= v_cycle_days then 'paid' else payout_status end,
          status = case when v_target_day >= v_cycle_days then 'completed_payout' else status end,
          interest_status = case when v_target_day >= v_cycle_days then 'completed' else interest_status end
      where id = v_tx.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION public.disburse_daily_investment_payouts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.disburse_daily_investment_payouts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disburse_daily_investment_payouts() TO service_role;

SELECT cron.schedule('disburse-daily-investment-payouts', '*/15 * * * *', 'select public.disburse_daily_investment_payouts();');
