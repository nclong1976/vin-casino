-- Chứng khoán - Giai đoạn 2 (docs/design/stock-investment-spec.md §2.5, §6).
--
--   * Lệnh BÁN LO / MP / ATO / ATC (RPC place_stock_sell_order). Chỉ bán được
--     cổ phiếu đã về tài khoản; đặt lệnh => giữ cổ phiếu (stock_positions.qty_hold),
--     huỷ / hết hiệu lực => trả lại.
--   * Khớp bán: phí giao dịch + thuế TNCN 0,1% giá trị bán (stock_config.sell_tax_rate),
--     giá vốn bình quân giảm theo tỉ lệ, ghi lãi/lỗ đã thực hiện.
--   * Tiền bán chờ về T+2: thủ tục stock_settle_due() (cron mỗi phút, COMMIT
--     từng giao dịch) cộng tiền về ví lúc 13:00 ngày T+2 - mỗi khoản 1 thông
--     báo "Biến động số dư ... ND: TIEN BAN VRE 100 CP"; cổ phiếu mua về cũng
--     chuyển sang khả dụng tại đây.
--   * Tiền bán ghi wallet_transactions.type = 'stock_sale' (không tính vào
--     tổng nạp - wallet_tx_counts_as_deposit chỉ nhận type 'deposit').

-- ───────────────────────── Cột mới ─────────────────────────

ALTER TABLE public.stock_config
  ADD COLUMN IF NOT EXISTS sell_tax_rate numeric NOT NULL DEFAULT 0.001;
ALTER TABLE public.stock_config DROP CONSTRAINT IF EXISTS stock_config_sell_tax_check;
ALTER TABLE public.stock_config ADD CONSTRAINT stock_config_sell_tax_check
  CHECK (sell_tax_rate >= 0 AND sell_tax_rate < 0.05);

ALTER TABLE public.stock_orders
  ADD COLUMN IF NOT EXISTS tax bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE public.stock_trades
  ADD COLUMN IF NOT EXISTS tax bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount bigint,
  ADD COLUMN IF NOT EXISTS cost_basis bigint,
  ADD COLUMN IF NOT EXISTS realized_pnl bigint;

ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS qty_hold bigint NOT NULL DEFAULT 0;
ALTER TABLE public.stock_positions DROP CONSTRAINT IF EXISTS stock_positions_hold_check;
ALTER TABLE public.stock_positions ADD CONSTRAINT stock_positions_hold_check
  CHECK (qty_hold >= 0 AND qty_pending + qty_hold <= qty);

-- Lệnh mua đã có: giá trị ròng = giá trị + phí (để lịch sử khớp thống nhất).
UPDATE public.stock_trades SET net_amount = amount + fee WHERE net_amount IS NULL AND side = 'BUY';

-- ───────────────────────── Khớp 1 lệnh (mua / bán) ─────────────────────────

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
  pos public.stock_positions;
  v_amount bigint;
  v_fee bigint;
  v_tax bigint := 0;
  v_cost bigint;
  v_net bigint;
  v_basis bigint;
  v_release bigint;
  v_trade_date date;
  v_settle date;
  v_wtx_id text;
begin
  select * into o from public.stock_orders where id = p_order_id;
  if not found or o.status <> 'pending' then
    return false;
  end if;

  v_trade_date := coalesce(o.trade_date, public.stock_vn_now()::date);
  v_settle := case when p_instant_settle then v_trade_date else public.stock_add_trading_days(v_trade_date, 2) end;
  v_amount := round(p_price * o.qty)::bigint;
  v_fee := round(v_amount * o.fee_rate)::bigint;

  if o.side = 'SELL' then
    select * into pos from public.stock_positions where user_id = o.user_id and symbol = o.symbol for update;
    if not found or pos.qty_hold < o.qty or pos.qty < o.qty then
      return false;
    end if;
    v_tax := round(v_amount * o.tax_rate)::bigint;
    v_net := v_amount - v_fee - v_tax;
    v_basis := case when pos.qty = o.qty then pos.total_cost
                    else round(pos.total_cost::numeric * o.qty / pos.qty)::bigint end;

    insert into public.stock_trades (order_id, user_id, symbol, project_id, side, price, qty, amount, fee, tax,
                                     net_amount, cost_basis, realized_pnl, trade_date, settle_date)
    values (o.id, o.user_id, o.symbol, o.project_id, 'SELL', p_price, o.qty, v_amount, v_fee, v_tax,
            v_net, v_basis, v_net - v_basis, v_trade_date, v_settle);

    update public.stock_positions
       set qty = qty - o.qty, qty_hold = qty_hold - o.qty, total_cost = total_cost - v_basis, updated_at = now()
     where user_id = o.user_id and symbol = o.symbol;

    update public.stock_orders
       set status = 'filled', filled_qty = o.qty, price = p_price, avg_fill_price = p_price,
           amount = v_amount, fee = v_fee, tax = v_tax, filled_at = now(), updated_at = now()
     where id = o.id;

    update public.stock_quotes set volume = volume + o.qty, updated_at = now() where symbol = o.symbol;

    if p_notify then
      perform public.stock_notify(o.user_id, 'Khớp lệnh bán ' || o.symbol,
        'Lệnh bán ' || public.stock_fmt(o.qty) || ' CP ' || o.symbol || ' đã khớp giá ' || public.stock_fmt(p_price) ||
        ' đ. Giá trị ' || public.stock_fmt(v_amount) || ' đ, phí ' || public.stock_fmt(v_fee) || ' đ, thuế ' ||
        public.stock_fmt(v_tax) || ' đ. Tiền về ví ' || public.stock_fmt(v_net) || ' đ ngày ' ||
        to_char(v_settle, 'DD/MM/YYYY') || ' (lãi/lỗ ' || case when v_net - v_basis >= 0 then '+' else '-' end ||
        public.stock_fmt(abs(v_net - v_basis)) || ' đ).',
        jsonb_build_object('order_id', o.id, 'symbol', o.symbol, 'event', 'filled', 'side', 'SELL'));
    end if;
    return true;
  end if;

  -- MUA
  v_cost := v_amount + v_fee;
  if o.charged then
    v_release := o.hold_amount - v_cost;
    if v_release < 0 then
      return false;
    end if;
  else
    v_release := 0;
  end if;

  insert into public.stock_trades (order_id, user_id, symbol, project_id, side, price, qty, amount, fee,
                                   net_amount, trade_date, settle_date, settled_at)
  values (o.id, o.user_id, o.symbol, o.project_id, 'BUY', p_price, o.qty, v_amount, v_fee,
          v_cost, v_trade_date, v_settle, case when p_instant_settle then now() end);

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

  update public.stock_quotes set volume = volume + o.qty, updated_at = now() where symbol = o.symbol;

  if v_release > 0 then
    perform public.stock_adjust_balance(o.user_id, v_release, p_memo);
  end if;

  if p_notify then
    perform public.stock_notify(o.user_id, 'Khớp lệnh mua ' || o.symbol,
      'Lệnh mua ' || public.stock_fmt(o.qty) || ' CP ' || o.symbol || ' đã khớp giá ' || public.stock_fmt(p_price) ||
      ' đ. Giá trị ' || public.stock_fmt(v_amount) || ' đ, phí ' || public.stock_fmt(v_fee) || ' đ' ||
      case when v_release > 0 then '. Hoàn tiền phong toả thừa ' || public.stock_fmt(v_release) || ' đ' else '' end ||
      '. Cổ phiếu về tài khoản ngày ' || to_char(v_settle, 'DD/MM/YYYY') || '.',
      jsonb_build_object('order_id', o.id, 'symbol', o.symbol, 'event', 'filled', 'side', 'BUY'));
  end if;
  return true;
end;
$$;

-- Huỷ / hết hiệu lực: lệnh mua hoàn tiền phong toả, lệnh bán trả cổ phiếu đang giữ.
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
  v_side text;
begin
  select * into o from public.stock_orders where id = p_order_id;
  if not found or o.status <> 'pending' then
    return false;
  end if;
  update public.stock_orders
     set status = p_status, cancelled_at = now(), cancel_reason = p_reason, updated_at = now()
   where id = o.id;
  if o.side = 'SELL' then
    update public.stock_positions
       set qty_hold = greatest(0, qty_hold - o.qty), updated_at = now()
     where user_id = o.user_id and symbol = o.symbol;
  elsif o.charged and o.hold_amount > 0 then
    perform public.stock_adjust_balance(o.user_id, o.hold_amount, p_memo);
  end if;
  if p_notify then
    v_side := case when o.side = 'SELL' then 'bán' else 'mua' end;
    perform public.stock_notify(o.user_id,
      case when p_status = 'expired' then 'Lệnh hết hiệu lực' else 'Lệnh đã huỷ' end || ' - ' || o.symbol,
      'Lệnh ' || o.order_type || ' ' || v_side || ' ' || public.stock_fmt(o.qty) || ' CP ' || o.symbol ||
      coalesce(' giá ' || public.stock_fmt(o.limit_price) || ' đ', '') || ' ' ||
      case when p_status = 'expired' then 'hết hiệu lực' else 'đã huỷ' end ||
      coalesce(' (' || p_reason || ')', '') || '. ' ||
      case when o.side = 'SELL' then 'Cổ phiếu đã được trả lại danh mục.'
           else 'Đã hoàn ' || public.stock_fmt(o.hold_amount) || ' đ tiền phong toả.' end,
      jsonb_build_object('order_id', o.id, 'symbol', o.symbol, 'event', p_status, 'side', o.side));
  end if;
  return true;
end;
$$;

-- ───────────────────────── Đặt lệnh (lõi chung mua / bán) ─────────────────────────

CREATE OR REPLACE FUNCTION public.stock_place_order_core(
  p_uid text,
  p_side text,
  p_project_id text,
  p_order_type text,
  p_qty bigint,
  p_limit_price numeric,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_type text := upper(coalesce(nullif(btrim(p_order_type), ''), 'MP'));
  v_side text := upper(coalesce(p_side, 'BUY'));
  v_cfg public.stock_config;
  v_proj record;
  v_q public.stock_quotes;
  v_session text := public.stock_session();
  v_trade_date date := public.stock_order_trade_date();
  v_unit numeric;
  v_hold bigint := 0;
  v_user record;
  v_pos public.stock_positions;
  v_order public.stock_orders;
  v_filled boolean := false;
  v_memo text;
begin
  if p_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if v_side not in ('BUY', 'SELL') then
    raise exception 'INVALID_ORDER_TYPE' using errcode = 'P0001';
  end if;

  if v_key is not null then
    select * into v_order from public.stock_orders where user_id = p_uid and idempotency_key = v_key;
    if found then
      return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true,
        'balance', (select balance from public.users where id = p_uid));
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
  end if;

  select id, balance, is_locked into v_user from public.users where id = p_uid for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_user.is_locked then
    raise exception 'ACCOUNT_LOCKED' using errcode = 'P0001';
  end if;

  if v_side = 'BUY' then
    v_unit := case when v_type = 'LO' then p_limit_price else greatest(v_q.ceiling_price, v_q.last_price) end;
    v_hold := ceil(v_unit * p_qty * (1 + v_cfg.fee_rate))::bigint;
    if coalesce(v_user.balance, 0) < v_hold then
      raise exception 'INSUFFICIENT_BUYING_POWER' using errcode = 'P0001';
    end if;
    perform public.stock_adjust_balance(p_uid, -v_hold,
      'PHONG TOA LENH ' || v_type || ' MUA ' || v_q.symbol || ' ' || p_qty);
  else
    select * into v_pos from public.stock_positions where user_id = p_uid and symbol = v_q.symbol for update;
    if not found or v_pos.qty - v_pos.qty_pending - v_pos.qty_hold < p_qty then
      raise exception 'INSUFFICIENT_SHARES' using errcode = 'P0001';
    end if;
    update public.stock_positions set qty_hold = qty_hold + p_qty, updated_at = now()
     where user_id = p_uid and symbol = v_q.symbol;
  end if;

  insert into public.stock_orders (user_id, project_id, symbol, side, order_type, qty, limit_price, amount,
                                   status, source, charged, idempotency_key, created_by,
                                   fee_rate, tax_rate, hold_amount, trade_date)
  values (p_uid, v_proj.id, v_q.symbol, v_side, v_type, p_qty, case when v_type = 'LO' then p_limit_price end, 0,
          'pending', 'user', true, v_key, p_uid,
          v_cfg.fee_rate, case when v_side = 'SELL' then v_cfg.sell_tax_rate else 0 end, v_hold, v_trade_date)
  returning * into v_order;

  -- Khớp liên tục ngay: MP luôn khớp; LO mua khớp nếu giá đặt >= giá hiện tại,
  -- LO bán khớp nếu giá đặt <= giá hiện tại.
  if v_session = 'CONT' and v_trade_date = public.stock_vn_now()::date
     and (v_type = 'MP'
          or (v_side = 'BUY' and p_limit_price >= v_q.last_price)
          or (v_side = 'SELL' and p_limit_price <= v_q.last_price)) then
    v_memo := case when v_side = 'BUY' then 'MUA CO PHIEU ' || v_q.symbol || ' SL ' || p_qty end;
    v_filled := public.stock_execute_fill(v_order.id, v_q.last_price, v_memo, v_side = 'SELL', false);
    if v_filled and v_memo is not null then
      perform set_config('app.balance_memo', v_memo, true);
    end if;
    select * into v_order from public.stock_orders where id = v_order.id;
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false, 'session', v_session,
    'balance', (select balance from public.users where id = p_uid));
end;
$$;

REVOKE ALL ON FUNCTION public.stock_place_order_core(text, text, text, text, bigint, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_stock_order(
  p_project_id text,
  p_order_type text,
  p_qty bigint,
  p_limit_price numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select public.stock_place_order_core(auth.uid()::text, 'BUY', p_project_id, p_order_type, p_qty,
                                       p_limit_price, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.place_stock_sell_order(
  p_project_id text,
  p_order_type text,
  p_qty bigint,
  p_limit_price numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select public.stock_place_order_core(auth.uid()::text, 'SELL', p_project_id, p_order_type, p_qty,
                                       p_limit_price, p_idempotency_key);
$$;

REVOKE ALL ON FUNCTION public.place_stock_sell_order(text, text, bigint, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_stock_sell_order(text, text, bigint, numeric, text) TO authenticated;

-- Huỷ lệnh: nội dung ND theo chiều lệnh.
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
  v_other boolean;
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
  if not v_admin and v_session in ('ATO', 'ATC') and o.trade_date = public.stock_vn_now()::date then
    raise exception 'CANCEL_NOT_ALLOWED_IN_SESSION' using errcode = 'P0001';
  end if;
  v_other := v_admin and o.user_id <> auth.uid()::text;
  perform public.stock_release_order(o.id, 'cancelled', case when v_other then 'Admin huỷ' end,
    'HUY LENH ' || case when o.side = 'SELL' then 'BAN ' else 'MUA ' end || o.symbol || ' ' || o.qty, v_other);
  select * into o from public.stock_orders where id = p_order_id;
  return jsonb_build_object('order', to_jsonb(o), 'balance', (select balance from public.users where id = o.user_id));
end;
$$;

-- Admin: phí, thuế bán, biên độ.
CREATE OR REPLACE FUNCTION public.admin_set_stock_fees(p_fee_rate numeric, p_sell_tax_rate numeric, p_price_band_pct numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_cfg public.stock_config;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  update public.stock_config
     set sell_tax_rate = coalesce(p_sell_tax_rate, sell_tax_rate), updated_at = now()
   where id = 1;
  perform public.admin_set_stock_config(p_fee_rate, p_price_band_pct);
  select * into v_cfg from public.stock_config where id = 1;
  return to_jsonb(v_cfg);
end;
$$;

REVOKE ALL ON FUNCTION public.admin_set_stock_fees(numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_stock_fees(numeric, numeric, numeric) TO authenticated;

-- ───────────────────────── Khớp lệnh (mua + bán) ─────────────────────────

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
       and trade_date = public.stock_vn_now()::date
       and ((side = 'BUY' and limit_price >= v_q.last_price) or (side = 'SELL' and limit_price <= v_q.last_price))
     order by created_at
     for update skip locked
  loop
    if public.stock_execute_fill(r.id, v_q.last_price, 'GIAI TOA TIEN LENH CO PHIEU', true, false) then
      n := n + 1;
    else
      perform public.stock_release_order(r.id, 'cancelled', 'Không đủ tiền / cổ phiếu', 'GIAI TOA TIEN LENH CO PHIEU', true);
    end if;
  end loop;
  return n;
end;
$$;

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
    select id, side, order_type, limit_price from public.stock_orders
     where symbol = p_symbol and status = 'pending' and trade_date = p_trade_date
       and (order_type = p_kind or order_type = 'LO')
     order by case when order_type = p_kind then 0 else 1 end, created_at
     for update skip locked
  loop
    if r.order_type = p_kind
       or (r.side = 'BUY' and r.limit_price >= p_price)
       or (r.side = 'SELL' and r.limit_price <= p_price) then
      if not public.stock_execute_fill(r.id, p_price, 'GIAI TOA TIEN LENH CO PHIEU', true, false) then
        perform public.stock_release_order(r.id, 'cancelled', 'Không đủ tiền / cổ phiếu', 'GIAI TOA TIEN LENH CO PHIEU', true);
      end if;
    end if;
  end loop;
end;
$$;

-- Cron khớp lệnh: như Giai đoạn 1, bỏ phần thanh toán T+2 (chuyển sang stock_settle_due).
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
  n_expired int := 0;
begin
  perform set_config('app.balance_memo', 'GIAI TOA TIEN LENH CO PHIEU', true);

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

    if not v_state.ato_done and v_now::time >= time '09:15' then
      for q in select * from public.stock_quotes loop
        update public.stock_quotes set open_price = q.last_price where symbol = q.symbol;
        insert into public.stock_price_ticks (symbol, price) values (q.symbol, q.last_price);
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

    if v_session = 'CONT' then
      for q in select symbol from public.stock_quotes loop
        perform public.stock_match_symbol(q.symbol);
      end loop;
    end if;

    if not v_state.atc_done and v_now::time >= time '14:45' then
      for q in select * from public.stock_quotes loop
        update public.stock_quotes set close_price = q.last_price where symbol = q.symbol;
        insert into public.stock_price_ticks (symbol, price) values (q.symbol, q.last_price);
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

  return jsonb_build_object('session', v_session, 'expired', n_expired);
end;
$$;

-- ───────────────────────── Thanh toán T+2 ─────────────────────────

-- Thanh toán 1 dòng khớp tới hạn: mua => cổ phiếu khả dụng; bán => cộng tiền
-- về ví (ND riêng cho từng khoản). Trả true nếu đã xử lý.
CREATE OR REPLACE FUNCTION public.stock_settle_trade(p_trade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  t public.stock_trades;
begin
  select * into t from public.stock_trades where id = p_trade_id and settled_at is null for update skip locked;
  if not found then
    return false;
  end if;
  if t.side = 'SELL' then
    perform public.stock_adjust_balance(t.user_id, coalesce(t.net_amount, 0),
      'TIEN BAN ' || t.symbol || ' ' || t.qty || ' CP');
    insert into public.wallet_transactions (id, user_id, type, amount, status, description, category)
    values ('stk_' || replace(gen_random_uuid()::text, '-', ''), t.user_id, 'stock_sale', coalesce(t.net_amount, 0),
            'completed', 'Bán ' || t.qty || ' cổ phiếu ' || t.symbol, 'Đầu tư chứng khoán');
  else
    update public.stock_positions
       set qty_pending = greatest(0, qty_pending - t.qty), updated_at = now()
     where user_id = t.user_id and symbol = t.symbol;
  end if;
  update public.stock_trades set settled_at = now() where id = t.id;
  return true;
end;
$$;

REVOKE ALL ON FUNCTION public.stock_settle_trade(uuid) FROM PUBLIC, anon, authenticated;

-- Cron mỗi phút: COMMIT sau từng khoản để mỗi khoản tiền bán có đúng 1 thông
-- báo "Biến động số dư" với ND riêng.
CREATE OR REPLACE PROCEDURE public.stock_settle_due()
LANGUAGE plpgsql
AS $$
declare
  v_now timestamp := public.stock_vn_now();
  r record;
begin
  -- Đóng giao dịch của lời gọi trước khi xử lý; mỗi khoản sau đó COMMIT riêng.
  commit;
  for r in
    select id from public.stock_trades
     where settled_at is null
       and (settle_date < v_now::date or (settle_date = v_now::date and v_now::time >= time '13:00'))
     order by settle_date, matched_at
     limit 500
  loop
    perform public.stock_settle_trade(r.id);
    commit;
  end loop;
end;
$$;

REVOKE ALL ON PROCEDURE public.stock_settle_due() FROM PUBLIC, anon, authenticated;

-- ───────────────────────── Bắt đầu biểu đồ & cron ─────────────────────────

INSERT INTO public.stock_price_ticks (symbol, price)
SELECT q.symbol, q.last_price FROM public.stock_quotes q
 WHERE NOT EXISTS (SELECT 1 FROM public.stock_price_ticks t WHERE t.symbol = q.symbol);

SELECT cron.schedule('stock-settle-due', '* * * * *', 'call public.stock_settle_due();');
