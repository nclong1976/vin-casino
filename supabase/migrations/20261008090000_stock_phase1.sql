-- Chứng khoán - Giai đoạn 1 (docs/design/stock-investment-spec.md §2, §4, §6).
--
--   * Bảng giá stock_quotes (TC / Trần / Sàn / mở cửa / đóng cửa / KL) đồng bộ
--     từ investment_projects.price_per_m2 - Admin vẫn sửa giá ở tab Dự án
--     (hoặc tab Chứng khoán), không có 2 nguồn giá.
--   * Phiên giao dịch mô phỏng HOSE theo giờ VN + lịch nghỉ stock_market_calendar.
--   * Lệnh LO / MP / ATO / ATC. Đặt lệnh = phong toả tiền (trừ thật khỏi ví);
--     khớp => giải toả phần chênh; huỷ / hết hiệu lực => hoàn đủ.
--   * Phí giao dịch cấu hình (stock_config.fee_rate, mặc định 0,15%).
--   * Cổ phiếu mua về T+2 (13:00 ngày T+2): qty_pending -> khả dụng.
--   * Cron mỗi phút stock_market_tick(): đổi ngày (giá TC = giá đóng cửa hôm
--     trước), khớp ATO 09:15, khớp liên tục, khớp ATC 14:45, hết hạn lệnh, T+2.
--
-- Mọi thay đổi tiền đi qua stock_adjust_balance => trigger "Biến động số dư"
-- tự sinh thông báo + Web Push (ND lấy từ app.balance_memo).

-- ───────────────────────── Cấu hình & lịch ─────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fee_rate numeric NOT NULL DEFAULT 0.0015 CHECK (fee_rate >= 0 AND fee_rate < 0.05),
  price_band_pct numeric NOT NULL DEFAULT 7 CHECK (price_band_pct > 0 AND price_band_pct <= 50),
  lot_size int NOT NULL DEFAULT 100 CHECK (lot_size > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.stock_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stock_market_calendar (
  date date PRIMARY KEY,
  is_trading_day boolean NOT NULL DEFAULT false,
  note text
);

CREATE TABLE IF NOT EXISTS public.stock_market_state (
  trade_date date PRIMARY KEY,
  ato_done boolean NOT NULL DEFAULT false,
  atc_done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Bảng giá ─────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_quotes (
  symbol text PRIMARY KEY,
  project_id text NOT NULL UNIQUE,
  reference_price numeric NOT NULL CHECK (reference_price > 0),
  ceiling_price numeric NOT NULL,
  floor_price numeric NOT NULL,
  last_price numeric NOT NULL CHECK (last_price > 0),
  open_price numeric,
  close_price numeric,
  high_price numeric,
  low_price numeric,
  volume bigint NOT NULL DEFAULT 0,
  trade_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_price_ticks (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  price numeric NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_price_ticks_symbol_ts_idx ON public.stock_price_ticks (symbol, ts DESC);

-- ───────────────────────── Lệnh, khớp, nắm giữ ─────────────────────────

ALTER TABLE public.stock_orders
  ADD COLUMN IF NOT EXISTS limit_price numeric,
  ADD COLUMN IF NOT EXISTS filled_qty bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_fill_price numeric,
  ADD COLUMN IF NOT EXISTS fee bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hold_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_date date,
  ADD COLUMN IF NOT EXISTS filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- price / amount = giá & giá trị KHỚP (lệnh chờ chưa có).
ALTER TABLE public.stock_orders ALTER COLUMN price DROP NOT NULL;
ALTER TABLE public.stock_orders DROP CONSTRAINT IF EXISTS stock_orders_status_check;
ALTER TABLE public.stock_orders ADD CONSTRAINT stock_orders_status_check
  CHECK (status IN ('pending', 'filled', 'cancelled', 'expired', 'rejected'));
CREATE INDEX IF NOT EXISTS stock_orders_pending_idx ON public.stock_orders (symbol, trade_date) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.stock_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.stock_orders(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  project_id text NOT NULL,
  side text NOT NULL DEFAULT 'BUY',
  price numeric NOT NULL,
  qty bigint NOT NULL CHECK (qty > 0),
  amount bigint NOT NULL,
  fee bigint NOT NULL DEFAULT 0,
  trade_date date NOT NULL,
  settle_date date NOT NULL,
  settled_at timestamptz,
  matched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_trades_user_idx ON public.stock_trades (user_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS stock_trades_unsettled_idx ON public.stock_trades (settle_date) WHERE settled_at IS NULL;

ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS qty_pending bigint NOT NULL DEFAULT 0;
ALTER TABLE public.stock_positions DROP CONSTRAINT IF EXISTS stock_positions_pending_check;
ALTER TABLE public.stock_positions ADD CONSTRAINT stock_positions_pending_check
  CHECK (qty_pending >= 0 AND qty_pending <= qty);

-- ───────────────────────── RLS ─────────────────────────

ALTER TABLE public.stock_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_market_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_market_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_price_ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_config_read ON public.stock_config;
CREATE POLICY stock_config_read ON public.stock_config FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_market_calendar_read ON public.stock_market_calendar;
CREATE POLICY stock_market_calendar_read ON public.stock_market_calendar FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_market_state_read ON public.stock_market_state;
CREATE POLICY stock_market_state_read ON public.stock_market_state FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_quotes_read ON public.stock_quotes;
CREATE POLICY stock_quotes_read ON public.stock_quotes FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_price_ticks_read ON public.stock_price_ticks;
CREATE POLICY stock_price_ticks_read ON public.stock_price_ticks FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_trades_select_own_or_admin ON public.stock_trades;
CREATE POLICY stock_trades_select_own_or_admin ON public.stock_trades
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.stock_config, public.stock_market_calendar, public.stock_market_state,
  public.stock_quotes, public.stock_price_ticks, public.stock_trades FROM anon, authenticated;
GRANT SELECT ON public.stock_config, public.stock_market_calendar, public.stock_market_state,
  public.stock_quotes, public.stock_price_ticks TO anon, authenticated;
GRANT SELECT ON public.stock_trades TO authenticated;

-- ───────────────────────── Tiện ích thời gian / giá ─────────────────────────

CREATE OR REPLACE FUNCTION public.stock_vn_now()
RETURNS timestamp LANGUAGE sql STABLE AS $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::timestamp;
$$;

CREATE OR REPLACE FUNCTION public.stock_is_trading_day(p_date date)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select coalesce(
    (select c.is_trading_day from public.stock_market_calendar c where c.date = p_date),
    extract(isodow from p_date) between 1 and 5
  );
$$;

CREATE OR REPLACE FUNCTION public.stock_add_trading_days(p_date date, p_n int)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
declare
  d date := p_date;
  k int := 0;
begin
  while k < p_n loop
    d := d + 1;
    if public.stock_is_trading_day(d) then
      k := k + 1;
    end if;
  end loop;
  return d;
end;
$$;

-- PRE_OPEN (trước 9:00) · ATO (9:00-9:15) · CONT (9:15-11:30, 13:00-14:30)
-- · BREAK (11:30-13:00) · ATC (14:30-14:45) · CLOSED (sau 14:45 / ngày nghỉ)
CREATE OR REPLACE FUNCTION public.stock_session(p_ts timestamp DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
declare
  ts timestamp := coalesce(p_ts, public.stock_vn_now());
  t time := ts::time;
begin
  if not public.stock_is_trading_day(ts::date) then
    return 'CLOSED';
  end if;
  if t < time '09:00' then return 'PRE_OPEN'; end if;
  if t < time '09:15' then return 'ATO'; end if;
  if t < time '11:30' then return 'CONT'; end if;
  if t < time '13:00' then return 'BREAK'; end if;
  if t < time '14:30' then return 'CONT'; end if;
  if t < time '14:45' then return 'ATC'; end if;
  return 'CLOSED';
end;
$$;

-- Ngày giao dịch mà lệnh đặt lúc này thuộc về.
CREATE OR REPLACE FUNCTION public.stock_order_trade_date(p_ts timestamp DEFAULT NULL)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
declare
  ts timestamp := coalesce(p_ts, public.stock_vn_now());
begin
  if public.stock_session(ts) <> 'CLOSED' then
    return ts::date;
  end if;
  return public.stock_add_trading_days(ts::date, 1);
end;
$$;

CREATE OR REPLACE FUNCTION public.stock_tick_size(p_price numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  select case when p_price < 10000 then 10 when p_price < 50000 then 50 else 100 end::numeric;
$$;

-- Trần = làm tròn xuống theo bước giá, Sàn = làm tròn lên (như HOSE).
CREATE OR REPLACE FUNCTION public.stock_band(p_ref numeric, OUT ceiling_price numeric, OUT floor_price numeric)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
declare
  pct numeric := coalesce((select price_band_pct from public.stock_config where id = 1), 7) / 100;
  c numeric := p_ref * (1 + pct);
  f numeric := p_ref * (1 - pct);
begin
  ceiling_price := floor(c / public.stock_tick_size(c)) * public.stock_tick_size(c);
  floor_price := ceil(f / public.stock_tick_size(f)) * public.stock_tick_size(f);
  if floor_price <= 0 then
    floor_price := public.stock_tick_size(p_ref);
  end if;
end;
$$;

-- ───────────────────────── Tiền & thông báo ─────────────────────────

-- Cộng/trừ ví cho nghiệp vụ cổ phiếu (đã kiểm tra quyền ở hàm gọi). Không cho
-- số dư âm. memo => ND của thông báo "Biến động số dư".
CREATE OR REPLACE FUNCTION public.stock_adjust_balance(p_user_id text, p_delta bigint, p_memo text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_balance bigint;
begin
  if coalesce(p_delta, 0) = 0 then
    select balance into v_balance from public.users where id = p_user_id;
    return v_balance;
  end if;
  if p_memo is not null then
    perform set_config('app.balance_memo', left(p_memo, 200), true);
  end if;
  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
     set balance = balance + p_delta,
         balance_version = balance_version + 1,
         last_active = now()
   where id = p_user_id
  returning balance into v_balance;
  if v_balance is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_balance < 0 then
    raise exception 'INSUFFICIENT_BUYING_POWER' using errcode = 'P0001';
  end if;
  return v_balance;
end;
$$;

CREATE OR REPLACE FUNCTION public.stock_notify(p_user_id text, p_title text, p_content text, p_extra jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
  values ('ntf_stk_' || replace(gen_random_uuid()::text, '-', ''), p_user_id, p_title, p_content, 'stock', false, now(), p_extra);
$$;

CREATE OR REPLACE FUNCTION public.stock_fmt(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  select replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,999,990'), ',', '.');
$$;

-- ───────────────────────── Khớp / huỷ một lệnh ─────────────────────────

-- Khớp toàn bộ 1 lệnh chờ tại p_price. Hàm gọi đã khoá dòng lệnh (FOR UPDATE)
-- và kiểm tra status = 'pending'. Trả false nếu tiền phong toả không đủ (giá
-- khớp vượt mức phong toả) - hàm gọi sẽ huỷ lệnh.
CREATE OR REPLACE FUNCTION public.stock_execute_fill(
  p_order_id uuid,
  p_price numeric,
  p_memo text,
  p_notify boolean DEFAULT false,
  p_instant_settle boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  o public.stock_orders;
  v_amount bigint;
  v_fee bigint;
  v_cost bigint;
  v_release bigint;
  v_settle date;
  v_wtx_id text;
begin
  select * into o from public.stock_orders where id = p_order_id;
  if not found or o.status <> 'pending' then
    return false;
  end if;

  v_amount := round(p_price * o.qty)::bigint;
  v_fee := round(v_amount * o.fee_rate)::bigint;
  v_cost := v_amount + v_fee;

  if o.charged then
    v_release := o.hold_amount - v_cost;
    if v_release < 0 then
      return false;
    end if;
  else
    v_release := 0;
  end if;

  v_settle := case when p_instant_settle then coalesce(o.trade_date, public.stock_vn_now()::date)
                   else public.stock_add_trading_days(coalesce(o.trade_date, public.stock_vn_now()::date), 2) end;

  insert into public.stock_trades (order_id, user_id, symbol, project_id, side, price, qty, amount, fee,
                                   trade_date, settle_date, settled_at)
  values (o.id, o.user_id, o.symbol, o.project_id, o.side, p_price, o.qty, v_amount, v_fee,
          coalesce(o.trade_date, public.stock_vn_now()::date), v_settle,
          case when p_instant_settle then now() end);

  if o.charged then
    v_wtx_id := 'stk_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.wallet_transactions (id, user_id, type, amount, status, description, category, note)
    values (v_wtx_id, o.user_id, 'investment', v_cost, 'completed',
            'Mua ' || o.qty || ' cổ phiếu ' || o.symbol, 'Đầu tư chứng khoán', o.note);
  end if;

  update public.stock_orders
     set status = 'filled', filled_qty = o.qty, price = p_price, avg_fill_price = p_price,
         amount = v_amount, fee = v_fee, filled_at = now(), updated_at = now(),
         wallet_transaction_id = coalesce(v_wtx_id, wallet_transaction_id)
   where id = o.id;

  insert into public.stock_positions as sp (user_id, symbol, project_id, qty, qty_pending, total_cost)
  values (o.user_id, o.symbol, o.project_id, o.qty, case when p_instant_settle then 0 else o.qty end, v_cost)
  on conflict (user_id, symbol) do update
    set qty = sp.qty + excluded.qty,
        qty_pending = sp.qty_pending + excluded.qty_pending,
        total_cost = sp.total_cost + excluded.total_cost,
        project_id = excluded.project_id,
        updated_at = now();

  update public.stock_quotes
     set volume = volume + o.qty, updated_at = now()
   where symbol = o.symbol;

  if v_release > 0 then
    perform public.stock_adjust_balance(o.user_id, v_release, p_memo);
  end if;

  if p_notify then
    perform public.stock_notify(o.user_id, 'Khớp lệnh mua ' || o.symbol,
      'Lệnh mua ' || public.stock_fmt(o.qty) || ' CP ' || o.symbol || ' đã khớp giá ' || public.stock_fmt(p_price) ||
      ' đ. Giá trị ' || public.stock_fmt(v_amount) || ' đ, phí ' || public.stock_fmt(v_fee) || ' đ' ||
      case when v_release > 0 then '. Hoàn tiền phong toả thừa ' || public.stock_fmt(v_release) || ' đ' else '' end ||
      '. Cổ phiếu về tài khoản ngày ' || to_char(v_settle, 'DD/MM/YYYY') || '.',
      jsonb_build_object('order_id', o.id, 'symbol', o.symbol, 'event', 'filled'));
  end if;
  return true;
end;
$$;

-- Huỷ / hết hiệu lực 1 lệnh chờ: hoàn đủ tiền phong toả.
CREATE OR REPLACE FUNCTION public.stock_release_order(
  p_order_id uuid,
  p_status text,
  p_reason text,
  p_memo text,
  p_notify boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  o public.stock_orders;
begin
  select * into o from public.stock_orders where id = p_order_id;
  if not found or o.status <> 'pending' then
    return false;
  end if;
  update public.stock_orders
     set status = p_status, cancelled_at = now(), cancel_reason = p_reason, updated_at = now()
   where id = o.id;
  if o.charged and o.hold_amount > 0 then
    perform public.stock_adjust_balance(o.user_id, o.hold_amount, p_memo);
  end if;
  if p_notify then
    perform public.stock_notify(o.user_id,
      case when p_status = 'expired' then 'Lệnh hết hiệu lực' else 'Lệnh đã huỷ' end || ' - ' || o.symbol,
      'Lệnh ' || o.order_type || ' mua ' || public.stock_fmt(o.qty) || ' CP ' || o.symbol ||
      coalesce(' giá ' || public.stock_fmt(o.limit_price) || ' đ', '') || ' ' ||
      case when p_status = 'expired' then 'hết hiệu lực' else 'đã huỷ' end ||
      coalesce(' (' || p_reason || ')', '') || '. Đã hoàn ' || public.stock_fmt(o.hold_amount) || ' đ tiền phong toả.',
      jsonb_build_object('order_id', o.id, 'symbol', o.symbol, 'event', p_status));
  end if;
  return true;
end;
$$;

-- ───────────────────────── Đặt / huỷ lệnh (người dùng) ─────────────────────────

-- Chữ ký mới (p_order_type bắt buộc) khác thứ tự tham số với bản Giai đoạn 0
-- (p_project_id, p_qty, p_idempotency_key) nên PostgREST phân biệt được theo
-- tên tham số; bản cũ giữ lại làm lớp tương thích (lệnh MP) bên dưới.
CREATE OR REPLACE FUNCTION public.place_stock_order(
  p_project_id text,
  p_order_type text,
  p_qty bigint,
  p_limit_price numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_type text := upper(coalesce(nullif(btrim(p_order_type), ''), 'MP'));
  v_cfg public.stock_config;
  v_proj record;
  v_q public.stock_quotes;
  v_session text := public.stock_session();
  v_trade_date date := public.stock_order_trade_date();
  v_unit numeric;
  v_hold bigint;
  v_user record;
  v_order public.stock_orders;
  v_filled boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if v_key is not null then
    select * into v_order from public.stock_orders where user_id = v_uid and idempotency_key = v_key;
    if found then
      return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true,
        'balance', (select balance from public.users where id = v_uid));
    end if;
  end if;

  select * into v_cfg from public.stock_config where id = 1;

  select id, category, is_active into v_proj from public.investment_projects where id = p_project_id;
  if not found or btrim(coalesce(v_proj.category, '')) <> 'Đầu tư chứng khoán' then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_proj.is_active is not true then
    raise exception 'SYMBOL_HALTED' using errcode = 'P0001';
  end if;
  select * into v_q from public.stock_quotes where project_id = p_project_id;
  if not found then
    raise exception 'PRICE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if v_type not in ('LO', 'MP', 'ATO', 'ATC') then
    raise exception 'INVALID_ORDER_TYPE' using errcode = 'P0001';
  end if;
  if not (
       (v_session in ('PRE_OPEN', 'CLOSED') and v_type in ('LO', 'ATO'))
    or (v_session = 'ATO' and v_type in ('LO', 'ATO'))
    or (v_session = 'CONT' and v_type in ('LO', 'MP'))
    or (v_session = 'BREAK' and v_type = 'LO')
    or (v_session = 'ATC' and v_type in ('LO', 'ATC'))
  ) then
    raise exception 'ORDER_TYPE_NOT_ALLOWED_IN_SESSION' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 or p_qty > 10000000
     or (p_qty % v_cfg.lot_size <> 0 and not (v_type = 'LO' and p_qty < v_cfg.lot_size)) then
    raise exception 'INVALID_LOT' using errcode = 'P0001';
  end if;

  if v_type = 'LO' then
    if p_limit_price is null or p_limit_price < v_q.floor_price or p_limit_price > v_q.ceiling_price then
      raise exception 'PRICE_OUT_OF_BAND' using errcode = 'P0001';
    end if;
    if p_limit_price % public.stock_tick_size(p_limit_price) <> 0 then
      raise exception 'INVALID_TICK_SIZE' using errcode = 'P0001';
    end if;
    v_unit := p_limit_price;
  else
    v_unit := greatest(v_q.ceiling_price, v_q.last_price);
  end if;
  v_hold := ceil(v_unit * p_qty * (1 + v_cfg.fee_rate))::bigint;

  select id, balance, is_locked into v_user from public.users where id = v_uid for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_user.is_locked then
    raise exception 'ACCOUNT_LOCKED' using errcode = 'P0001';
  end if;
  if coalesce(v_user.balance, 0) < v_hold then
    raise exception 'INSUFFICIENT_BUYING_POWER' using errcode = 'P0001';
  end if;

  perform public.stock_adjust_balance(v_uid, -v_hold,
    'PHONG TOA LENH ' || v_type || ' MUA ' || v_q.symbol || ' ' || p_qty);

  insert into public.stock_orders (user_id, project_id, symbol, side, order_type, qty, limit_price, amount,
                                   status, source, charged, idempotency_key, created_by,
                                   fee_rate, hold_amount, trade_date)
  values (v_uid, v_proj.id, v_q.symbol, 'BUY', v_type, p_qty, case when v_type = 'LO' then p_limit_price end, 0,
          'pending', 'user', true, v_key, v_uid,
          v_cfg.fee_rate, v_hold, v_trade_date)
  returning * into v_order;

  -- Khớp liên tục: MP luôn khớp ngay; LO khớp ngay nếu giá đặt >= giá hiện tại.
  if v_session = 'CONT' and v_trade_date = public.stock_vn_now()::date
     and (v_type = 'MP' or p_limit_price >= v_q.last_price) then
    v_filled := public.stock_execute_fill(v_order.id, v_q.last_price,
      'MUA CO PHIEU ' || v_q.symbol || ' SL ' || p_qty, false, false);
    if v_filled then
      perform set_config('app.balance_memo', 'MUA CO PHIEU ' || v_q.symbol || ' SL ' || p_qty, true);
    end if;
    select * into v_order from public.stock_orders where id = v_order.id;
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false, 'session', v_session,
    'balance', (select balance from public.users where id = v_uid));
end;
$$;

REVOKE ALL ON FUNCTION public.place_stock_order(text, text, bigint, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_stock_order(text, text, bigint, numeric, text) TO authenticated;

-- Tương thích ứng dụng bản cũ (Giai đoạn 0): lệnh MP.
CREATE OR REPLACE FUNCTION public.place_stock_order(
  p_project_id text,
  p_qty bigint,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select public.place_stock_order(p_project_id, 'MP', p_qty, null, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.cancel_stock_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  o public.stock_orders;
  v_admin boolean := public.is_admin();
  v_session text := public.stock_session();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into o from public.stock_orders where id = p_order_id for update;
  if not found or (o.user_id <> auth.uid()::text and not v_admin) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if o.status <> 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  -- Như HOSE: không huỷ lệnh trong phiên khớp định kỳ của chính ngày lệnh.
  if not v_admin and v_session in ('ATO', 'ATC') and o.trade_date = public.stock_vn_now()::date then
    raise exception 'CANCEL_NOT_ALLOWED_IN_SESSION' using errcode = 'P0001';
  end if;
  perform public.stock_release_order(o.id, 'cancelled',
    case when v_admin and o.user_id <> auth.uid()::text then 'Admin huỷ' else null end,
    'HUY LENH MUA ' || o.symbol || ' ' || o.qty, v_admin and o.user_id <> auth.uid()::text);
  select * into o from public.stock_orders where id = p_order_id;
  return jsonb_build_object('order', to_jsonb(o), 'balance', (select balance from public.users where id = o.user_id));
end;
$$;

REVOKE ALL ON FUNCTION public.cancel_stock_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_order(uuid) TO authenticated;

-- ───────────────────────── Admin ─────────────────────────

-- Admin cấp cổ phần cho khách theo giá hiện tại (về tài khoản ngay, không
-- theo phiên). Trừ ví tuỳ chọn, không thu phí.
CREATE OR REPLACE FUNCTION public.admin_create_stock_order(
  p_user_id text,
  p_project_id text,
  p_qty bigint,
  p_charge_wallet boolean DEFAULT false,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_proj record;
  v_q public.stock_quotes;
  v_user record;
  v_amount bigint;
  v_charge boolean := coalesce(p_charge_wallet, false);
  v_order public.stock_orders;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 10000000 then
    raise exception 'INVALID_QTY' using errcode = 'P0001';
  end if;
  select id, category into v_proj from public.investment_projects where id = p_project_id;
  if not found or btrim(coalesce(v_proj.category, '')) <> 'Đầu tư chứng khoán' then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_q from public.stock_quotes where project_id = p_project_id;
  if not found then
    raise exception 'PRICE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_amount := round(v_q.last_price * p_qty)::bigint;

  select id, balance into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_charge then
    if coalesce(v_user.balance, 0) < v_amount then
      raise exception 'INSUFFICIENT_BUYING_POWER' using errcode = 'P0001';
    end if;
    perform public.stock_adjust_balance(p_user_id, -v_amount, 'MUA CO PHIEU ' || v_q.symbol || ' SL ' || p_qty);
  end if;

  insert into public.stock_orders (user_id, project_id, symbol, side, order_type, qty, amount, status, source,
                                   charged, note, created_by, fee_rate, hold_amount, trade_date)
  values (p_user_id, v_proj.id, v_q.symbol, 'BUY', 'MP', p_qty, 0, 'pending', 'admin',
          v_charge, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()::text, 0,
          case when v_charge then v_amount else 0 end, public.stock_vn_now()::date)
  returning * into v_order;

  perform public.stock_execute_fill(v_order.id, v_q.last_price, null, false, true);
  select * into v_order from public.stock_orders where id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'balance', (select balance from public.users where id = p_user_id));
end;
$$;

REVOKE ALL ON FUNCTION public.admin_create_stock_order(text, text, bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_stock_order(text, text, bigint, boolean, text) TO authenticated;

-- Đặt giá hiện tại (trong biên độ Trần/Sàn). Ghi vào investment_projects để
-- tab Dự án, thẻ cổ phiếu cũ và bảng giá luôn cùng một giá.
CREATE OR REPLACE FUNCTION public.admin_set_stock_price(p_symbol text, p_price numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_q public.stock_quotes;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select * into v_q from public.stock_quotes where symbol = upper(p_symbol);
  if not found then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < v_q.floor_price or p_price > v_q.ceiling_price then
    raise exception 'PRICE_OUT_OF_BAND' using errcode = 'P0001';
  end if;
  if p_price % public.stock_tick_size(p_price) <> 0 then
    raise exception 'INVALID_TICK_SIZE' using errcode = 'P0001';
  end if;
  update public.investment_projects set price_per_m2 = p_price where id = v_q.project_id;
  select * into v_q from public.stock_quotes where symbol = upper(p_symbol);
  return to_jsonb(v_q);
end;
$$;

-- Đặt lại giá tham chiếu (niêm yết lại / điều chỉnh): TC = giá hiện tại = p_price.
CREATE OR REPLACE FUNCTION public.admin_reset_stock_reference(p_symbol text, p_price numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_q public.stock_quotes;
  b record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;
  select * into v_q from public.stock_quotes where symbol = upper(p_symbol);
  if not found then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  b := public.stock_band(p_price);
  update public.stock_quotes
     set reference_price = p_price, ceiling_price = b.ceiling_price, floor_price = b.floor_price, updated_at = now()
   where symbol = v_q.symbol;
  update public.investment_projects set price_per_m2 = p_price where id = v_q.project_id;
  select * into v_q from public.stock_quotes where symbol = v_q.symbol;
  return to_jsonb(v_q);
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_stock_config(p_fee_rate numeric, p_price_band_pct numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  r record;
  b record;
  v_cfg public.stock_config;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  update public.stock_config
     set fee_rate = coalesce(p_fee_rate, fee_rate),
         price_band_pct = coalesce(p_price_band_pct, price_band_pct),
         updated_at = now()
   where id = 1
  returning * into v_cfg;
  for r in select symbol, reference_price from public.stock_quotes loop
    b := public.stock_band(r.reference_price);
    update public.stock_quotes set ceiling_price = b.ceiling_price, floor_price = b.floor_price, updated_at = now()
     where symbol = r.symbol;
  end loop;
  return to_jsonb(v_cfg);
end;
$$;

REVOKE ALL ON FUNCTION public.admin_set_stock_price(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_stock_price(text, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_stock_reference(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_stock_reference(text, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_stock_config(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_stock_config(numeric, numeric) TO authenticated;

-- ───────────────────────── Khớp lệnh ─────────────────────────

-- Khớp liên tục: lệnh LO chờ của ngày hôm nay có giá đặt >= giá hiện tại.
CREATE OR REPLACE FUNCTION public.stock_match_symbol(p_symbol text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_q public.stock_quotes;
  r record;
  n int := 0;
begin
  if public.stock_session() <> 'CONT' then
    return 0;
  end if;
  select * into v_q from public.stock_quotes where symbol = p_symbol;
  if not found then
    return 0;
  end if;
  for r in
    select id from public.stock_orders
     where symbol = p_symbol and status = 'pending' and order_type = 'LO'
       and trade_date = public.stock_vn_now()::date and limit_price >= v_q.last_price
     order by limit_price desc, created_at
     for update skip locked
  loop
    if public.stock_execute_fill(r.id, v_q.last_price, 'GIAI TOA TIEN LENH CO PHIEU', true, false) then
      n := n + 1;
    else
      perform public.stock_release_order(r.id, 'cancelled', 'Không đủ tiền phong toả', 'GIAI TOA TIEN LENH CO PHIEU', true);
    end if;
  end loop;
  return n;
end;
$$;

-- Khớp định kỳ (ATO / ATC) tại p_price cho 1 mã.
CREATE OR REPLACE FUNCTION public.stock_run_auction(p_symbol text, p_kind text, p_price numeric, p_trade_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  r record;
begin
  for r in
    select id, order_type, limit_price from public.stock_orders
     where symbol = p_symbol and status = 'pending' and trade_date = p_trade_date
       and (order_type = p_kind or order_type = 'LO')
     order by case when order_type = p_kind then 0 else 1 end, limit_price desc nulls first, created_at
     for update skip locked
  loop
    if r.order_type = p_kind or r.limit_price >= p_price then
      if not public.stock_execute_fill(r.id, p_price, 'GIAI TOA TIEN LENH CO PHIEU', true, false) then
        perform public.stock_release_order(r.id, 'cancelled', 'Không đủ tiền phong toả', 'GIAI TOA TIEN LENH CO PHIEU', true);
      end if;
    end if;
  end loop;
end;
$$;

-- Cron mỗi phút.
CREATE OR REPLACE FUNCTION public.stock_market_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_now timestamp := public.stock_vn_now();
  v_today date := v_now::date;
  v_session text := public.stock_session(v_now);
  v_state public.stock_market_state;
  q record;
  r record;
  b record;
  n_settled int := 0;
  n_expired int := 0;
begin
  perform set_config('app.balance_memo', 'GIAI TOA TIEN LENH CO PHIEU', true);

  -- 1. Lệnh của ngày đã qua còn chờ => hết hiệu lực (phòng cron từng dừng).
  for r in
    select id from public.stock_orders
     where status = 'pending' and trade_date < v_today
     for update skip locked
  loop
    if public.stock_release_order(r.id, 'expired', 'Hết phiên giao dịch', 'GIAI TOA TIEN LENH CO PHIEU', true) then
      n_expired := n_expired + 1;
    end if;
  end loop;

  if public.stock_is_trading_day(v_today) then
    -- 2. Sang ngày giao dịch mới: TC = giá đóng cửa (hoặc giá cuối) hôm trước.
    for q in select * from public.stock_quotes where trade_date < v_today for update loop
      b := public.stock_band(coalesce(q.close_price, q.last_price));
      update public.stock_quotes
         set reference_price = coalesce(q.close_price, q.last_price),
             ceiling_price = b.ceiling_price, floor_price = b.floor_price,
             open_price = null, close_price = null, high_price = null, low_price = null,
             volume = 0, trade_date = v_today, updated_at = now()
       where symbol = q.symbol;
      update public.investment_projects
         set daily_change_percent = round((q.last_price / coalesce(q.close_price, q.last_price) - 1) * 100, 2)
       where id = q.project_id;
    end loop;

    insert into public.stock_market_state (trade_date) values (v_today) on conflict (trade_date) do nothing;
    select * into v_state from public.stock_market_state where trade_date = v_today for update;

    -- 3. ATO lúc 09:15.
    if not v_state.ato_done and v_now::time >= time '09:15' then
      for q in select * from public.stock_quotes loop
        update public.stock_quotes set open_price = q.last_price where symbol = q.symbol;
        perform public.stock_run_auction(q.symbol, 'ATO', q.last_price, v_today);
      end loop;
      for r in
        select id from public.stock_orders
         where status = 'pending' and order_type = 'ATO' and trade_date = v_today
         for update skip locked
      loop
        perform public.stock_release_order(r.id, 'expired', 'ATO không khớp', 'GIAI TOA TIEN LENH CO PHIEU', true);
      end loop;
      update public.stock_market_state set ato_done = true, updated_at = now() where trade_date = v_today;
    end if;

    -- 4. Khớp liên tục.
    if v_session = 'CONT' then
      for q in select symbol from public.stock_quotes loop
        perform public.stock_match_symbol(q.symbol);
      end loop;
    end if;

    -- 5. ATC lúc 14:45, sau đó lệnh LO còn lại hết hiệu lực.
    if not v_state.atc_done and v_now::time >= time '14:45' then
      for q in select * from public.stock_quotes loop
        update public.stock_quotes set close_price = q.last_price where symbol = q.symbol;
        perform public.stock_run_auction(q.symbol, 'ATC', q.last_price, v_today);
      end loop;
      for r in
        select id from public.stock_orders
         where status = 'pending' and trade_date = v_today
         for update skip locked
      loop
        if public.stock_release_order(r.id, 'expired', 'Hết phiên giao dịch', 'GIAI TOA TIEN LENH CO PHIEU', true) then
          n_expired := n_expired + 1;
        end if;
      end loop;
      update public.stock_market_state set atc_done = true, updated_at = now() where trade_date = v_today;
    end if;
  end if;

  -- 6. T+2: cổ phiếu về tài khoản lúc 13:00 ngày thanh toán.
  for r in
    select id, user_id, symbol, qty from public.stock_trades
     where settled_at is null
       and (settle_date < v_today or (settle_date = v_today and v_now::time >= time '13:00'))
     for update skip locked
  loop
    update public.stock_positions
       set qty_pending = greatest(0, qty_pending - r.qty), updated_at = now()
     where user_id = r.user_id and symbol = r.symbol;
    update public.stock_trades set settled_at = now() where id = r.id;
    n_settled := n_settled + 1;
  end loop;

  return jsonb_build_object('session', v_session, 'expired', n_expired, 'settled', n_settled);
end;
$$;

REVOKE ALL ON FUNCTION public.stock_adjust_balance(text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_notify(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_execute_fill(uuid, numeric, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_release_order(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_match_symbol(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_run_auction(text, text, numeric, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_market_tick() FROM PUBLIC, anon, authenticated;
-- Lõi khớp lệnh Giai đoạn 0 đã được thay bằng stock_execute_fill.
CREATE OR REPLACE FUNCTION public.stock_fill_buy(
  p_user_id text, p_project_id text, p_qty bigint, p_charge boolean,
  p_source text, p_idempotency_key text, p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  raise exception 'DEPRECATED' using errcode = 'P0001';
end;
$$;

-- ───────────────────────── Đồng bộ giá với investment_projects ─────────────────────────

-- Giá sửa ở tab Dự án được giữ trong biên độ Trần/Sàn; % thay đổi tính theo TC.
CREATE OR REPLACE FUNCTION public.stock_project_price_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_q public.stock_quotes;
  v_tick numeric;
begin
  if btrim(coalesce(new.category, '')) <> 'Đầu tư chứng khoán' or coalesce(new.price_per_m2, 0) <= 0 then
    return new;
  end if;
  select * into v_q from public.stock_quotes where project_id = new.id;
  if not found then
    return new;
  end if;
  if new.price_per_m2 is distinct from old.price_per_m2 then
    new.price_per_m2 := least(v_q.ceiling_price, greatest(v_q.floor_price, new.price_per_m2));
    v_tick := public.stock_tick_size(new.price_per_m2);
    new.price_per_m2 := round(new.price_per_m2 / v_tick) * v_tick;
    new.price_per_m2 := least(v_q.ceiling_price, greatest(v_q.floor_price, new.price_per_m2));
  end if;
  new.daily_change_percent := round((new.price_per_m2 / v_q.reference_price - 1) * 100, 2);
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.stock_project_price_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_symbol text;
  v_price numeric := round(coalesce(new.price_per_m2, 0));
  v_q public.stock_quotes;
  b record;
begin
  if btrim(coalesce(new.category, '')) <> 'Đầu tư chứng khoán' or v_price <= 0 then
    return null;
  end if;
  v_symbol := upper(coalesce(nullif(btrim(new.stock_symbol), ''),
                             (regexp_match(coalesce(new.title, ''), '\(([^)]+)\)'))[1]));
  if v_symbol is null then
    return null;
  end if;

  select * into v_q from public.stock_quotes where project_id = new.id;
  if not found then
    b := public.stock_band(v_price);
    insert into public.stock_quotes (symbol, project_id, reference_price, ceiling_price, floor_price,
                                     last_price, trade_date)
    values (v_symbol, new.id, v_price, b.ceiling_price, b.floor_price, v_price, public.stock_vn_now()::date)
    on conflict (symbol) do nothing;
    return null;
  end if;

  if v_q.last_price is distinct from v_price or v_q.symbol is distinct from v_symbol then
    update public.stock_quotes
       set symbol = v_symbol,
           last_price = v_price,
           high_price = greatest(coalesce(high_price, v_price), v_price),
           low_price = least(coalesce(low_price, v_price), v_price),
           updated_at = now()
     where project_id = new.id;
    insert into public.stock_price_ticks (symbol, price) values (v_symbol, v_price);
    perform public.stock_match_symbol(v_symbol);
  end if;
  return null;
end;
$$;

DROP TRIGGER IF EXISTS trg_stock_project_price_guard ON public.investment_projects;
CREATE TRIGGER trg_stock_project_price_guard
  BEFORE UPDATE OF price_per_m2, daily_change_percent ON public.investment_projects
  FOR EACH ROW EXECUTE FUNCTION public.stock_project_price_guard();

DROP TRIGGER IF EXISTS trg_stock_project_price_sync ON public.investment_projects;
CREATE TRIGGER trg_stock_project_price_sync
  AFTER INSERT OR UPDATE OF price_per_m2, stock_symbol, category ON public.investment_projects
  FOR EACH ROW EXECUTE FUNCTION public.stock_project_price_sync();

-- ───────────────────────── Dữ liệu hiện có ─────────────────────────

-- Bảng giá ban đầu: TC = giá hiện tại của từng mã.
INSERT INTO public.stock_quotes (symbol, project_id, reference_price, ceiling_price, floor_price, last_price, trade_date)
SELECT s.symbol, s.id, s.price, b.ceiling_price, b.floor_price, s.price, public.stock_vn_now()::date
  FROM (
    SELECT p.id,
           upper(coalesce(nullif(btrim(p.stock_symbol), ''), (regexp_match(coalesce(p.title, ''), '\(([^)]+)\)'))[1])) AS symbol,
           round(p.price_per_m2) AS price
      FROM public.investment_projects p
     WHERE btrim(coalesce(p.category, '')) = 'Đầu tư chứng khoán' AND coalesce(p.price_per_m2, 0) > 0
  ) s
  CROSS JOIN LATERAL public.stock_band(s.price) b
 WHERE s.symbol IS NOT NULL
ON CONFLICT (symbol) DO NOTHING;

UPDATE public.investment_projects p
   SET daily_change_percent = 0
  FROM public.stock_quotes q
 WHERE q.project_id = p.id;

-- Lệnh Giai đoạn 0 (đã khớp, đã có cổ phần khả dụng): bổ sung cột mới + dòng khớp.
UPDATE public.stock_orders
   SET filled_qty = qty, avg_fill_price = price, hold_amount = CASE WHEN charged THEN amount ELSE 0 END,
       trade_date = (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, filled_at = coalesce(filled_at, created_at)
 WHERE status = 'filled' AND trade_date IS NULL;

INSERT INTO public.stock_trades (order_id, user_id, symbol, project_id, side, price, qty, amount, fee,
                                 trade_date, settle_date, settled_at, matched_at)
SELECT o.id, o.user_id, o.symbol, o.project_id, o.side, o.price, o.qty, o.amount, 0,
       o.trade_date, o.trade_date, now(), o.created_at
  FROM public.stock_orders o
 WHERE o.status = 'filled' AND NOT EXISTS (SELECT 1 FROM public.stock_trades t WHERE t.order_id = o.id);

-- ───────────────────────── Web Push: thông báo lệnh mở tab Lệnh ─────────────────────────

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
           'url', case when n.type = 'document' and n.extra ? 'document_id' then '/document/' || (n.extra->>'document_id')
                       when n.type = 'stock' then '/stocks?tab=orders' else '/' end,
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

-- ───────────────────────── Realtime & cron ─────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_quotes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_trades;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT cron.schedule('stock-market-tick', '* * * * *', 'select public.stock_market_tick();');
