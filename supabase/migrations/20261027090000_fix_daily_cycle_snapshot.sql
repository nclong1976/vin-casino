-- Sửa lỗi lệch/kẹt ngày giải ngân khi admin ĐỔI KỲ HẠN dự án sau khi đã có
-- người đầu tư.
--
-- Trước đây disburse_daily_investment_payouts() tính số ngày chu kỳ
-- (v_cycle_days) từ kỳ hạn HIỆN TẠI của dự án (investment_projects.
-- term_duration_minutes) mỗi lần chạy. Nếu admin đổi kỳ hạn dự án sau khi
-- người dùng đã đầu tư, chu kỳ của các lệnh ĐANG CHẠY bị tính lại sai:
--   - Chu kỳ co lại nhỏ hơn số ngày ĐÃ trả -> target_day <= days_paid ->
--     hàm bỏ qua mãi, KHÔNG bao giờ trả tiếp và KHÔNG hoàn vốn gốc (kẹt).
--   - Hoặc chu kỳ giãn ra -> số tiền mỗi ngày tính sai.
--
-- Sửa: mỗi lệnh có mốc đáo hạn riêng matures_at (chốt lúc tạo, được bảo vệ
-- khỏi sửa) - đó mới là "hợp đồng". Chu kỳ phải bám theo matures_at, KHÔNG
-- phụ thuộc kỳ hạn dự án (có thể đổi). Ưu tiên snapshot transactions.
-- duration_days; nếu thiếu/0 thì suy từ (matures_at - created_date).

-- 1) Chụp duration_days ngay lúc tạo lệnh = số ngày theo kỳ hạn dự án tại
--    thời điểm đó (khớp matures_at), không tin giá trị client gửi.
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
  new.created_date := now();
  new.matures_at := new.created_date + make_interval(mins => v_project.term_duration_minutes);
  new.duration_days := greatest(1, floor(coalesce(v_project.term_duration_minutes, 1440) / 1440.0)::int);
  new.interest_status := 'pending';
  new.payout_status := coalesce(new.payout_status, 'pending');
  new.status := coalesce(new.status, 'completed');
  new.payout_model := case
    when v_project.category = 'VinHomes' then 'DAILY_ACCRUAL'
    else 'LUMP_SUM'
  end;

  return new;
end;
$function$;

-- 2) disburse: dùng chu kỳ của CHÍNH lệnh (snapshot duration_days, fallback
--    suy từ matures_at) thay vì kỳ hạn hiện tại của dự án.
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

    -- Chu kỳ bám theo HỢP ĐỒNG của lệnh (snapshot duration_days, nếu thiếu
    -- thì suy từ matures_at - created_date), KHÔNG lấy kỳ hạn hiện tại của
    -- dự án để tránh lệch khi admin đổi kỳ hạn sau khi đã có người đầu tư.
    v_cycle_days := greatest(1, coalesce(
      nullif(v_tx.duration_days, 0),
      round(extract(epoch from (v_tx.matures_at - v_tx.created_date)) / 86400.0)::int
    ));
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

-- 3) Bù dữ liệu: các lệnh ĐANG CHẠY (chưa trả xong) có duration_days lệch so
--    với mốc đáo hạn -> gán lại theo (matures_at - created_date) để khớp hợp
--    đồng. KHÔNG đụng lệnh đã trả xong (giữ nguyên lịch sử).
DO $$
BEGIN
  PERFORM set_config('app.trusted_balance_rpc', 'on', true);
  UPDATE public.transactions
     SET duration_days = greatest(1, round(extract(epoch from (matures_at - created_date)) / 86400.0)::int)
   WHERE payout_model = 'DAILY_ACCRUAL'
     AND payout_status is distinct from 'paid'
     AND status is distinct from 'completed_payout'
     AND matures_at is not null
     AND duration_days is distinct from greatest(1, round(extract(epoch from (matures_at - created_date)) / 86400.0)::int);
END $$;
