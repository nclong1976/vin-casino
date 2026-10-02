-- Chứng khoán - Giai đoạn 3: cổ tức (docs/design/stock-investment-spec.md §3).
--
--   * stock_corporate_actions: Admin công bố quyền - cổ tức TIỀN MẶT (đ/CP,
--     thuế TNCN 5%) hoặc CỔ PHIẾU (cổ tức bằng CP / CP thưởng, tỉ lệ b:a).
--     Mốc: GDKHQ (ex_date) · ĐKCC (record_date) · ngày thực hiện (payment_date).
--   * Quyền tính từ lịch sử khớp (stock_trades), đúng thông lệ VN: mua khớp
--     TRƯỚC ngày GDKHQ => có quyền; bán từ ngày GDKHQ trở đi vẫn có quyền.
--       số CP hưởng quyền = Σ mua (trade_date < GDKHQ) − Σ bán (trade_date < GDKHQ)
--   * Ngày GDKHQ: giá tham chiếu được điều chỉnh (tiền: P − cổ tức/CP;
--     CP: P × b/(a+b)) trong stock_market_tick.
--   * Ngày ĐKCC: chốt danh sách (stock_dividend_entitlements). Ngày thực hiện:
--     tiền về ví (type 'dividend' - không tính vào tổng nạp) / CP về tài khoản
--     ngay (giá vốn bình quân giảm, tổng giá vốn giữ nguyên). Thủ tục
--     stock_dividends_due (cron) COMMIT từng người => mỗi khoản 1 thông báo
--     "Biến động số dư ... ND: CO TUC VRE ...". Chạy lại không trả trùng.

-- CP nhận từ cổ tức cũng là 1 dòng stock_trades (không gắn lệnh) để các đợt
-- quyền sau tính đúng số CP nắm giữ.
ALTER TABLE public.stock_trades ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.stock_trades ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'order';

CREATE TABLE IF NOT EXISTS public.stock_corporate_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  project_id text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('CASH', 'STOCK')),
  cash_per_share numeric CHECK (cash_per_share IS NULL OR cash_per_share > 0),
  ratio_from int CHECK (ratio_from IS NULL OR ratio_from > 0),
  ratio_to int CHECK (ratio_to IS NULL OR ratio_to > 0),
  tax_rate numeric NOT NULL DEFAULT 0.05 CHECK (tax_rate >= 0 AND tax_rate < 1),
  ex_date date NOT NULL,
  record_date date NOT NULL,
  payment_date date NOT NULL,
  status text NOT NULL DEFAULT 'announced' CHECK (status IN ('announced', 'recorded', 'paid', 'cancelled')),
  note text,
  ex_adjusted_at timestamptz,
  recorded_at timestamptz,
  paid_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (record_date >= ex_date AND payment_date >= record_date),
  CHECK ((action_type = 'CASH' AND cash_per_share IS NOT NULL)
      OR (action_type = 'STOCK' AND ratio_from IS NOT NULL AND ratio_to IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS stock_corporate_actions_symbol_idx ON public.stock_corporate_actions (symbol, ex_date);

CREATE TABLE IF NOT EXISTS public.stock_dividend_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.stock_corporate_actions(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  qty_eligible bigint NOT NULL CHECK (qty_eligible > 0),
  gross bigint NOT NULL DEFAULT 0,
  tax bigint NOT NULL DEFAULT 0,
  net bigint NOT NULL DEFAULT 0,
  shares bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, user_id)
);
CREATE INDEX IF NOT EXISTS stock_dividend_entitlements_user_idx ON public.stock_dividend_entitlements (user_id, created_at DESC);

ALTER TABLE public.stock_corporate_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_dividend_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_corporate_actions_read ON public.stock_corporate_actions;
CREATE POLICY stock_corporate_actions_read ON public.stock_corporate_actions FOR SELECT USING (true);
DROP POLICY IF EXISTS stock_dividend_entitlements_select_own_or_admin ON public.stock_dividend_entitlements;
CREATE POLICY stock_dividend_entitlements_select_own_or_admin ON public.stock_dividend_entitlements
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.stock_corporate_actions, public.stock_dividend_entitlements FROM anon, authenticated;
GRANT SELECT ON public.stock_corporate_actions TO anon, authenticated;
GRANT SELECT ON public.stock_dividend_entitlements TO authenticated;

-- ───────────────────────── Tính quyền ─────────────────────────

-- Số CP hưởng quyền của từng người cho 1 mã tại ngày GDKHQ.
CREATE OR REPLACE FUNCTION public.stock_eligible_holders(p_symbol text, p_ex_date date)
RETURNS TABLE (user_id text, qty bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select t.user_id,
         sum(case when t.side = 'BUY' then t.qty else -t.qty end)::bigint as qty
    from public.stock_trades t
   where t.symbol = p_symbol and t.trade_date < p_ex_date
   group by t.user_id
  having sum(case when t.side = 'BUY' then t.qty else -t.qty end) > 0;
$$;
REVOKE ALL ON FUNCTION public.stock_eligible_holders(text, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stock_action_label(a public.stock_corporate_actions)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  select case when a.action_type = 'CASH'
              then 'cổ tức tiền ' || public.stock_fmt(a.cash_per_share) || ' đ/CP'
              else 'cổ tức bằng cổ phiếu tỉ lệ ' || a.ratio_from || ':' || a.ratio_to end;
$$;

-- Chốt danh sách (ĐKCC). Lũy đẳng: UNIQUE(action_id, user_id).
CREATE OR REPLACE FUNCTION public.stock_record_action(p_action_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  a public.stock_corporate_actions;
  n int;
begin
  select * into a from public.stock_corporate_actions where id = p_action_id for update;
  if not found or a.status <> 'announced' then
    return 0;
  end if;
  insert into public.stock_dividend_entitlements (action_id, user_id, symbol, qty_eligible, gross, tax, net, shares)
  select a.id, h.user_id, a.symbol, h.qty,
         case when a.action_type = 'CASH' then round(h.qty * a.cash_per_share)::bigint else 0 end,
         case when a.action_type = 'CASH' then round(round(h.qty * a.cash_per_share) * a.tax_rate)::bigint else 0 end,
         case when a.action_type = 'CASH'
              then (round(h.qty * a.cash_per_share) - round(round(h.qty * a.cash_per_share) * a.tax_rate))::bigint else 0 end,
         case when a.action_type = 'STOCK' then floor(h.qty::numeric * a.ratio_to / a.ratio_from)::bigint else 0 end
    from public.stock_eligible_holders(a.symbol, a.ex_date) h
  on conflict (action_id, user_id) do nothing;
  get diagnostics n = row_count;
  update public.stock_corporate_actions set status = 'recorded', recorded_at = now() where id = a.id;
  return n;
end;
$$;
REVOKE ALL ON FUNCTION public.stock_record_action(uuid) FROM PUBLIC, anon, authenticated;

-- Trả 1 quyền (tiền về ví / CP về tài khoản). Lũy đẳng theo status.
CREATE OR REPLACE FUNCTION public.stock_pay_entitlement(p_entitlement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  e public.stock_dividend_entitlements;
  a public.stock_corporate_actions;
begin
  select * into e from public.stock_dividend_entitlements where id = p_entitlement_id and status = 'pending' for update skip locked;
  if not found then
    return false;
  end if;
  select * into a from public.stock_corporate_actions where id = e.action_id;

  if a.action_type = 'CASH' then
    if e.net > 0 then
      perform public.stock_adjust_balance(e.user_id, e.net, 'CO TUC TIEN MAT ' || e.symbol || ' ' || e.qty_eligible || ' CP');
      insert into public.wallet_transactions (id, user_id, type, amount, status, description, category, note)
      values ('div_' || replace(gen_random_uuid()::text, '-', ''), e.user_id, 'dividend', e.net, 'completed',
              'Cổ tức ' || e.symbol || ' (' || public.stock_fmt(e.qty_eligible) || ' CP × ' || public.stock_fmt(a.cash_per_share) || ' đ)',
              'Cổ tức chứng khoán', 'Thuế TNCN ' || public.stock_fmt(e.tax) || ' đ');
    end if;
    perform public.stock_notify(e.user_id, 'Nhận cổ tức ' || e.symbol,
      'Bạn nhận cổ tức tiền mặt ' || e.symbol || ': ' || public.stock_fmt(e.qty_eligible) || ' CP × ' ||
      public.stock_fmt(a.cash_per_share) || ' đ = ' || public.stock_fmt(e.gross) || ' đ, thuế TNCN ' ||
      public.stock_fmt(e.tax) || ' đ. Thực nhận ' || public.stock_fmt(e.net) || ' đ vào ví.',
      jsonb_build_object('action_id', a.id, 'symbol', e.symbol, 'event', 'dividend'));
  else
    if e.shares > 0 then
      insert into public.stock_positions as sp (user_id, symbol, project_id, qty, qty_pending, total_cost)
      values (e.user_id, e.symbol, a.project_id, e.shares, 0, 0)
      on conflict (user_id, symbol) do update set qty = sp.qty + excluded.qty, updated_at = now();
      insert into public.stock_trades (order_id, user_id, symbol, project_id, side, price, qty, amount, fee,
                                       net_amount, trade_date, settle_date, settled_at, source)
      values (null, e.user_id, e.symbol, a.project_id, 'BUY', 0, e.shares, 0, 0, 0,
              a.payment_date, a.payment_date, now(), 'dividend');
    end if;
    perform public.stock_notify(e.user_id, 'Nhận cổ phiếu ' || e.symbol,
      'Bạn nhận ' || public.stock_fmt(e.shares) || ' CP ' || e.symbol || ' (' || public.stock_action_label(a) ||
      ', hưởng trên ' || public.stock_fmt(e.qty_eligible) || ' CP). Cổ phiếu đã về tài khoản; giá vốn bình quân được điều chỉnh.',
      jsonb_build_object('action_id', a.id, 'symbol', e.symbol, 'event', 'dividend'));
  end if;

  update public.stock_dividend_entitlements set status = 'paid', paid_at = now() where id = e.id;
  return true;
end;
$$;
REVOKE ALL ON FUNCTION public.stock_pay_entitlement(uuid) FROM PUBLIC, anon, authenticated;

-- Cron: chốt quyền khi tới ĐKCC, trả khi tới ngày thực hiện (từ 09:00).
-- COMMIT sau từng người để mỗi khoản tiền có ND riêng.
CREATE OR REPLACE PROCEDURE public.stock_dividends_due()
LANGUAGE plpgsql
AS $$
declare
  v_now timestamp := public.stock_vn_now();
  r record;
begin
  commit;
  for r in
    select id from public.stock_corporate_actions
     where status = 'announced' and record_date <= v_now::date
     order by record_date
  loop
    perform public.stock_record_action(r.id);
    commit;
  end loop;

  for r in
    select e.id from public.stock_dividend_entitlements e
      join public.stock_corporate_actions a on a.id = e.action_id
     where e.status = 'pending' and a.status = 'recorded'
       and (a.payment_date < v_now::date or (a.payment_date = v_now::date and v_now::time >= time '09:00'))
     order by a.payment_date
     limit 500
  loop
    perform public.stock_pay_entitlement(r.id);
    commit;
  end loop;

  update public.stock_corporate_actions a
     set status = 'paid', paid_at = now()
   where a.status = 'recorded'
     and (a.payment_date < v_now::date or (a.payment_date = v_now::date and v_now::time >= time '09:00'))
     and not exists (select 1 from public.stock_dividend_entitlements e where e.action_id = a.id and e.status = 'pending');
  commit;
end;
$$;
REVOKE ALL ON PROCEDURE public.stock_dividends_due() FROM PUBLIC, anon, authenticated;

-- ───────────────────────── Admin ─────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_corporate_action(
  p_project_id text,
  p_action_type text,
  p_cash_per_share numeric,
  p_ratio_from int,
  p_ratio_to int,
  p_ex_date date,
  p_record_date date,
  p_payment_date date,
  p_tax_rate numeric,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_q public.stock_quotes;
  v_type text := upper(coalesce(p_action_type, ''));
  v_record date;
  v_pay date;
  a public.stock_corporate_actions;
  h record;
  v_est text;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select * into v_q from public.stock_quotes where project_id = p_project_id;
  if not found then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_type not in ('CASH', 'STOCK') then
    raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end if;
  if v_type = 'CASH' and not (p_cash_per_share > 0) then
    raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end if;
  if v_type = 'STOCK' and not (p_ratio_from > 0 and p_ratio_to > 0) then
    raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end if;
  -- GDKHQ phải là ngày giao dịch trong tương lai (giá TC được điều chỉnh lúc mở ngày đó).
  if p_ex_date is null or p_ex_date <= public.stock_vn_now()::date or not public.stock_is_trading_day(p_ex_date) then
    raise exception 'INVALID_EX_DATE' using errcode = 'P0001';
  end if;
  v_record := coalesce(p_record_date, public.stock_add_trading_days(p_ex_date, 1));
  v_pay := coalesce(p_payment_date, v_record);
  if v_record < p_ex_date or v_pay < v_record then
    raise exception 'INVALID_DATES' using errcode = 'P0001';
  end if;

  insert into public.stock_corporate_actions (symbol, project_id, action_type, cash_per_share, ratio_from, ratio_to,
                                              tax_rate, ex_date, record_date, payment_date, note, created_by)
  values (v_q.symbol, v_q.project_id, v_type,
          case when v_type = 'CASH' then p_cash_per_share end,
          case when v_type = 'STOCK' then p_ratio_from end,
          case when v_type = 'STOCK' then p_ratio_to end,
          case when v_type = 'CASH' then coalesce(p_tax_rate, 0.05) else 0 end,
          p_ex_date, v_record, v_pay, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()::text)
  returning * into a;

  -- Báo cho người đang nắm giữ mã này.
  for h in select user_id, qty from public.stock_positions where symbol = a.symbol and qty > 0 loop
    v_est := case when a.action_type = 'CASH'
                  then 'dự kiến ' || public.stock_fmt(round(h.qty * a.cash_per_share * (1 - a.tax_rate))) || ' đ sau thuế'
                  else 'dự kiến ' || public.stock_fmt(floor(h.qty::numeric * a.ratio_to / a.ratio_from)) || ' CP' end;
    perform public.stock_notify(h.user_id, 'Lịch cổ tức ' || a.symbol,
      a.symbol || ' chia ' || public.stock_action_label(a) || '. GDKHQ ' || to_char(a.ex_date, 'DD/MM/YYYY') ||
      ', ĐKCC ' || to_char(a.record_date, 'DD/MM/YYYY') || ', thực hiện ' || to_char(a.payment_date, 'DD/MM/YYYY') ||
      '. Với ' || public.stock_fmt(h.qty) || ' CP đang nắm giữ: ' || v_est ||
      ' (giữ cổ phiếu đến hết ngày ' || to_char(a.ex_date - 1, 'DD/MM/YYYY') || ').',
      jsonb_build_object('action_id', a.id, 'symbol', a.symbol, 'event', 'announced'));
  end loop;

  return to_jsonb(a);
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_corporate_action(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  a public.stock_corporate_actions;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select * into a from public.stock_corporate_actions where id = p_action_id for update;
  if not found then
    raise exception 'ACTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Sau GDKHQ giá đã điều chỉnh / đã chốt quyền => không huỷ được.
  if a.status <> 'announced' or a.ex_adjusted_at is not null or a.ex_date <= public.stock_vn_now()::date then
    raise exception 'ACTION_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  update public.stock_corporate_actions set status = 'cancelled' where id = a.id returning * into a;
  return to_jsonb(a);
end;
$$;

REVOKE ALL ON FUNCTION public.admin_create_corporate_action(text, text, numeric, int, int, date, date, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_corporate_action(text, text, numeric, int, int, date, date, date, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_corporate_action(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_corporate_action(uuid) TO authenticated;

-- ───────────────────────── Điều chỉnh giá TC ngày GDKHQ ─────────────────────────

-- Giá tham chiếu ngày GDKHQ từ giá đóng cửa hôm trước. Đánh dấu ex_adjusted_at.
CREATE OR REPLACE FUNCTION public.stock_ex_adjusted_reference(p_symbol text, p_base numeric, p_date date)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  a record;
  v numeric := p_base;
  t numeric;
begin
  for a in
    select * from public.stock_corporate_actions
     where symbol = p_symbol and ex_date = p_date and status in ('announced', 'recorded') and ex_adjusted_at is null
     for update
  loop
    if a.action_type = 'CASH' then
      v := v - a.cash_per_share;
    else
      v := v * a.ratio_from / (a.ratio_from + a.ratio_to);
    end if;
    update public.stock_corporate_actions set ex_adjusted_at = now() where id = a.id;
  end loop;
  if v = p_base then
    return p_base;
  end if;
  t := public.stock_tick_size(v);
  return greatest(t, round(v / t) * t);
end;
$$;
REVOKE ALL ON FUNCTION public.stock_ex_adjusted_reference(text, numeric, date) FROM PUBLIC, anon, authenticated;

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
  v_ref numeric;
  v_base numeric;
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
      v_base := coalesce(q.close_price, q.last_price);
      v_ref := public.stock_ex_adjusted_reference(q.symbol, v_base, v_today);
      b := public.stock_band(v_ref);
      update public.stock_quotes
         set reference_price = v_ref,
             ceiling_price = b.ceiling_price, floor_price = b.floor_price,
             open_price = null, close_price = null, high_price = null, low_price = null,
             volume = 0, trade_date = v_today, updated_at = now()
       where symbol = q.symbol;
      if v_ref <> v_base then
        -- Ngày GDKHQ: giá hiện tại về đúng giá tham chiếu đã điều chỉnh.
        update public.investment_projects set price_per_m2 = v_ref where id = q.project_id;
      else
        update public.investment_projects
           set daily_change_percent = round((q.last_price / v_base - 1) * 100, 2)
         where id = q.project_id;
      end if;
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

-- Web Push: thông báo cổ tức mở tab Cổ tức.
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
                       when n.type = 'stock' and n.extra->>'event' in ('dividend', 'announced') then '/stocks?tab=dividends'
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

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_corporate_actions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_dividend_entitlements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT cron.schedule('stock-dividends-due', '* * * * *', 'call public.stock_dividends_due();');
