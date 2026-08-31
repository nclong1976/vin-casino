-- =====================================================================
-- Migration: chuyển mô hình lãi từ "per-unit rate x số đơn vị kỳ hạn"
-- (đang bị hiểu lầm là "lãi theo giờ") sang "lãi suất toàn kỳ" tường minh.
--
-- Hiện trạng trước migration (đã xác minh trên DB thật):
--   - investment_projects.rate    TEXT   vd '0.025%/giờ' (lãi theo ĐƠN VỊ)
--   - investment_projects.duration TEXT  vd '60' (số ĐƠN VỊ kỳ hạn, đơn vị
--                                         suy luận từ category/rate/title)
--   - transactions.profit  = amount * (rate/100) * durationVal  (đã tính 1
--     lần lúc tạo giao dịch, KHÔNG có cronjob cộng dồn mỗi giờ - cơ chế đó
--     đã bị gỡ trước đây, xem src/lib/dailyYieldEngine.js)
--   - resolve_project_maturity_payout(): trả gốc+lãi 1 LẦN khi đáo hạn,
--     nhưng tự suy luận đơn vị kỳ hạn bằng title ILIKE '%giờ%'/'%phút%'
--     (dễ vỡ, không index được) và KHÔNG có gì chặn client tự gửi sai
--     profit/rate lúc INSERT (protect_transaction_financial_fields chỉ
--     chặn UPDATE, không chặn INSERT).
--
-- Migration này KHÔNG đổi số tiền lãi đã tính cho giao dịch cũ (backfill
-- giữ nguyên công thức cũ, chỉ chuẩn hoá thành trường số tường minh) và
-- KHÔNG cần cronjob chạy hàng giờ nào - hệ thống vốn đã không có.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) investment_projects: chuẩn hoá lãi suất TOÀN KỲ + kỳ hạn ra phút
-- ---------------------------------------------------------------------
alter table public.investment_projects
  add column if not exists total_term_interest_rate numeric,
  add column if not exists term_duration_minutes integer;

-- Backfill từ dữ liệu chuỗi cũ. rate_unit/duration_raw đã cùng một đơn vị
-- (vd rate '0.025%/giờ' luôn đi kèm duration là SỐ GIỜ) nên total = rate x
-- duration_raw đúng bằng lãi toàn kỳ hiện đang hiển thị cho user.
with parsed as (
  select
    id,
    coalesce(nullif(regexp_replace(rate, '[^0-9.]', '', 'g'), '')::numeric, 0) as rate_val,
    coalesce(nullif(regexp_replace(duration, '[^0-9.]', '', 'g'), '')::numeric, 30) as duration_val,
    case
      when category = 'Dự Án' or rate ilike '%phút%' or duration ilike '%phút%' then 1
      when category in ('Đầu tư nghỉ dưỡng', 'Nghỉ dưỡng') or rate ilike '%giờ%' or title ilike '%vinpearl%' then 60
      else 1440
    end as unit_minutes
  from public.investment_projects
)
update public.investment_projects p
set
  total_term_interest_rate = coalesce(p.total_term_interest_rate, round(parsed.rate_val * parsed.duration_val, 4)),
  term_duration_minutes = coalesce(p.term_duration_minutes, round(parsed.duration_val * parsed.unit_minutes)::integer)
from parsed
where parsed.id = p.id;

alter table public.investment_projects
  alter column total_term_interest_rate set default 0,
  alter column term_duration_minutes set default 43200,
  alter column total_term_interest_rate set not null,
  alter column term_duration_minutes set not null;

comment on column public.investment_projects.total_term_interest_rate is
  'Lãi suất TOÀN KỲ (%) áp vào vốn gốc, thanh toán 1 lần khi đáo hạn. Thay thế hoàn toàn cách tính rate-theo-đơn-vị x số đơn vị.';
comment on column public.investment_projects.term_duration_minutes is
  'Kỳ hạn quy đổi ra phút - nguồn duy nhất để tính maturity_date, không phụ thuộc parse chuỗi duration/category nữa.';
comment on column public.investment_projects.rate is
  '[DEPRECATED - chỉ để hiển thị lịch sử] không dùng để tính lãi nữa, xem total_term_interest_rate.';
comment on column public.investment_projects.duration is
  '[DEPRECATED - chỉ để hiển thị lịch sử] không dùng để tính maturity_date nữa, xem term_duration_minutes.';

-- ---------------------------------------------------------------------
-- 2) transactions: thêm maturity_date tường minh + trạng thái lãi riêng
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists matures_at timestamptz,
  add column if not exists interest_status text default 'pending';

-- Backfill maturity_date cho giao dịch cũ bằng đúng logic mà RPC đáo hạn
-- đang dùng hiện tại (title ILIKE) - đảm bảo không đổi thời điểm đáo hạn
-- của các hợp đồng đã ký trước migration.
update public.transactions
set matures_at = coalesce(created_date, now()) + (
  case
    when project_title ilike '%phút%' then make_interval(mins => coalesce(duration_days, 30)::int)
    when project_title ilike '%giờ%' then make_interval(hours => coalesce(duration_days, 30)::int)
    else make_interval(days => coalesce(duration_days, 30)::int)
  end
)
where matures_at is null;

update public.transactions
set interest_status = case
  when payout_status = 'paid' or status = 'completed_payout' then 'completed'
  else 'pending'
end
where interest_status is null;

alter table public.transactions
  alter column interest_status set not null;

alter table public.transactions
  drop constraint if exists transactions_interest_status_check;
alter table public.transactions
  add constraint transactions_interest_status_check check (interest_status in ('pending', 'completed'));

-- Index phục vụ đúng 1 truy vấn quét-1-lần của worker quyết toán (mục 5),
-- partial index chỉ chứa các dòng CHƯA quyết toán nên luôn nhỏ gọn dù
-- bảng transactions phình to theo thời gian.
create index if not exists idx_transactions_pending_maturity
  on public.transactions (matures_at)
  where payout_status is distinct from 'paid' and status is distinct from 'completed_payout';

comment on column public.transactions.matures_at is
  'Thời điểm đáo hạn tuyệt đối = created_date + term_duration_minutes (snapshot lúc tạo). Nguồn duy nhất để quyết toán, không parse title nữa.';
comment on column public.transactions.interest_status is
  'pending: lãi đã tính trước nhưng chưa trả | completed: đã cộng gốc+lãi vào available_balance.';

commit;

-- =====================================================================
-- 3) Chặn lỗ hổng INSERT: server tự tính profit/total/matures_at từ
--    investment_projects, KHÔNG tin rate/profit/total client gửi lên nữa.
--    protect_transaction_financial_fields (đã có sẵn) chỉ chặn UPDATE, nên
--    lúc TẠO hợp đồng client vẫn có thể tự gửi profit tuỳ ý - trigger dưới
--    đây đóng nốt lỗ hổng đó ở khâu INSERT.
-- =====================================================================
create or replace function public.compute_transaction_interest()
returns trigger
language plpgsql
as $function$
declare
  v_project record;
begin
  if new.project_id is not null then
    select * into v_project from public.investment_projects where id = new.project_id;
  end if;

  if v_project.id is null then
    -- Không có project_id hợp lệ để tra lãi suất toàn kỳ gốc -> từ chối
    -- thay vì âm thầm ghi nhận một con số lãi không kiểm chứng được.
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

  return new;
end;
$function$;

drop trigger if exists trg_compute_transaction_interest on public.transactions;
create trigger trg_compute_transaction_interest
  before insert on public.transactions
  for each row execute function public.compute_transaction_interest();

-- Bổ sung matures_at/interest_status vào danh sách trường bị khoá sau khi
-- tạo (trước đây chưa tồn tại nên chưa được liệt kê) - user không được tự
-- sửa thời điểm đáo hạn hay trạng thái lãi của chính giao dịch của họ.
create or replace function public.protect_transaction_financial_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.user_id := old.user_id;
    new.amount := old.amount;
    new.profit := old.profit;
    new.total := old.total;
    new.rate := old.rate;
    new.duration_days := old.duration_days;
    new.shares := old.shares;
    new.payout_status := old.payout_status;
    new.status := old.status;
    new.contract_status := old.contract_status;
    new.project_id := old.project_id;
    new.project_name := old.project_name;
    new.project_title := old.project_title;
    new.created_date := old.created_date;
    new.matures_at := old.matures_at;
    new.interest_status := old.interest_status;
  end if;
  return new;
end;
$function$;

-- =====================================================================
-- 4) resolve_project_maturity_payout: dùng matures_at (indexed, tường
--    minh) thay vì suy luận đơn vị kỳ hạn bằng title ILIKE.
-- =====================================================================
create or replace function public.resolve_project_maturity_payout(p_tx_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if v_tx.payout_status = 'paid' or v_tx.status = 'completed_payout' then
    return jsonb_build_object('paid', false, 'reason', 'already_paid');
  end if;

  -- Xác thực đáo hạn bằng đồng hồ SERVER (now()) và mốc matures_at đã
  -- chốt sẵn lúc tạo giao dịch - không tin đồng hồ máy client.
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

-- =====================================================================
-- 5) Worker quyết toán 1 lần khi đáo hạn - thay thế hoàn toàn ý tưởng
--    "cronjob chạy hàng giờ cộng lãi": hàm này KHÔNG cộng lãi luỹ kế, chỉ
--    quét 1 lượt (1 câu lệnh, dùng index idx_transactions_pending_maturity
--    ở mục 2) các hợp đồng đã tới hạn rồi quyết toán gốc+lãi một lần cho
--    từng hợp đồng - đảm bảo đáo hạn được trả đúng giờ kể cả khi không có
--    phiên user/admin nào đang mở (khác với dailyYieldEngine.js phía
--    client, vốn phụ thuộc có người đang online mới trigger được).
--    FOR UPDATE SKIP LOCKED để không đụng độ với resolve_project_maturity_
--    payout() đang được 1 client gọi trùng thời điểm cho cùng giao dịch.
-- =====================================================================
create or replace function public.settle_matured_investments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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

revoke all on function public.settle_matured_investments() from public, anon, authenticated;

-- Lên lịch quét mỗi 5 phút - 1 job Postgres nhẹ, KHÔNG phải cronjob hàng
-- giờ cộng lãi luỹ kế. pg_cron chạy job bằng vai trò đã schedule (postgres),
-- không phụ thuộc phiên đăng nhập nào của user/admin.
create extension if not exists pg_cron;

select cron.unschedule('settle-matured-investments')
where exists (select 1 from cron.job where jobname = 'settle-matured-investments');

select cron.schedule(
  'settle-matured-investments',
  '*/5 * * * *',
  $$select public.settle_matured_investments();$$
);
