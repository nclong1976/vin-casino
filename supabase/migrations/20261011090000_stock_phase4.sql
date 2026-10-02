-- Chứng khoán - Giai đoạn 4 (docs/design/stock-investment-spec.md §3.3, §6).
--
--   * DRIP (tái đầu tư cổ tức tự động) theo từng mã: stock_drip_settings.
--     Khi cổ tức TIỀN MẶT về ví, nếu bật DRIP => đặt lệnh LO mua lại đúng mã ở
--     giá hiện tại, KL = floor(tiền ròng / (giá × (1 + phí))), làm tròn xuống
--     lô 100 (dưới 100 CP => lô lẻ). Không đủ 1 CP / mã tạm khoá / lỗi => tiền
--     ở lại ví và có thông báo. Lệnh DRIP chạy trong giao dịch RIÊNG sau khi
--     cổ tức đã về ví (thông báo biến động số dư tách bạch).
--   * Danh sách theo dõi stock_watchlist (người dùng tự thêm / bỏ).
--   * admin_stock_report(): số liệu tổng hợp cho Admin.

CREATE TABLE IF NOT EXISTS public.stock_drip_settings (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS public.stock_watchlist (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

ALTER TABLE public.stock_dividend_entitlements
  ADD COLUMN IF NOT EXISTS drip_order_id uuid,
  ADD COLUMN IF NOT EXISTS drip_note text;

ALTER TABLE public.stock_drip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_drip_settings_select_own_or_admin ON public.stock_drip_settings;
CREATE POLICY stock_drip_settings_select_own_or_admin ON public.stock_drip_settings
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS stock_watchlist_own ON public.stock_watchlist;
CREATE POLICY stock_watchlist_own ON public.stock_watchlist
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

REVOKE INSERT, UPDATE, DELETE ON public.stock_drip_settings FROM anon, authenticated;
GRANT SELECT ON public.stock_drip_settings TO authenticated;
REVOKE ALL ON public.stock_watchlist FROM anon;
GRANT SELECT, INSERT, DELETE ON public.stock_watchlist TO authenticated;

-- Bật / tắt DRIP cho 1 mã của chính mình.
CREATE OR REPLACE FUNCTION public.set_stock_drip(p_symbol text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_symbol text := upper(btrim(coalesce(p_symbol, '')));
  r public.stock_drip_settings;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stock_quotes where symbol = v_symbol) then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.stock_drip_settings as d (user_id, symbol, enabled, updated_at)
  values (v_uid, v_symbol, coalesce(p_enabled, false), now())
  on conflict (user_id, symbol) do update set enabled = excluded.enabled, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end;
$$;
REVOKE ALL ON FUNCTION public.set_stock_drip(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_drip(text, boolean) TO authenticated;

-- Đặt lệnh DRIP cho 1 quyền cổ tức tiền mặt đã trả. Lũy đẳng (drip_note).
CREATE OR REPLACE FUNCTION public.stock_drip_for_entitlement(p_entitlement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  e public.stock_dividend_entitlements;
  a public.stock_corporate_actions;
  q public.stock_quotes;
  v_fee numeric;
  v_price numeric;
  v_qty bigint;
  v_res jsonb;
  v_note text;
  v_err text;
begin
  select * into e from public.stock_dividend_entitlements
   where id = p_entitlement_id and status = 'paid' and drip_note is null
   for update skip locked;
  if not found then
    return false;
  end if;
  select * into a from public.stock_corporate_actions where id = e.action_id;
  if a.action_type <> 'CASH' or e.net <= 0
     or not exists (select 1 from public.stock_drip_settings d
                     where d.user_id = e.user_id and d.symbol = e.symbol and d.enabled) then
    update public.stock_dividend_entitlements set drip_note = 'off' where id = e.id;
    return false;
  end if;

  select * into q from public.stock_quotes where symbol = e.symbol;
  v_fee := coalesce((select fee_rate from public.stock_config where id = 1), 0);
  -- Giá đặt = giá hiện tại kẹp trong Trần/Sàn (giá TC đã điều chỉnh sau GDKHQ).
  v_price := least(q.ceiling_price, greatest(q.floor_price, q.last_price));
  v_qty := floor(e.net / (v_price * (1 + v_fee)));
  if v_qty >= 100 then
    v_qty := (v_qty / 100) * 100;
  end if;

  if v_qty < 1 then
    v_note := 'Cổ tức ' || public.stock_fmt(e.net) || ' đ chưa đủ mua 1 CP ' || e.symbol || ' - tiền giữ trong ví.';
  else
    begin
      v_res := public.stock_place_order_core(e.user_id, 'BUY', a.project_id, 'LO', v_qty, v_price,
                                             'drip-' || e.id::text);
      update public.stock_orders set source = 'drip', note = 'Tái đầu tư cổ tức ' || e.symbol
       where id = (v_res->'order'->>'id')::uuid;
      update public.stock_dividend_entitlements set drip_order_id = (v_res->'order'->>'id')::uuid where id = e.id;
      v_note := 'Đã đặt lệnh LO mua ' || public.stock_fmt(v_qty) || ' CP ' || e.symbol || ' giá ' ||
                public.stock_fmt(v_price) || ' đ từ cổ tức (' ||
                case when v_res->'order'->>'status' = 'filled' then 'đã khớp' else 'chờ khớp' end || ').';
    exception when others then
      v_err := sqlerrm;
      v_note := 'Không đặt được lệnh tái đầu tư ' || e.symbol || ' (' ||
                case when v_err like '%SYMBOL_HALTED%' then 'mã đang tạm khoá'
                     when v_err like '%INSUFFICIENT_BUYING_POWER%' then 'không đủ tiền'
                     when v_err like '%ACCOUNT_LOCKED%' then 'tài khoản bị khoá'
                     else 'lỗi hệ thống' end || ') - tiền cổ tức giữ trong ví.';
    end;
  end if;

  update public.stock_dividend_entitlements set drip_note = v_note where id = e.id;
  perform public.stock_notify(e.user_id, 'Tái đầu tư cổ tức ' || e.symbol, v_note,
    jsonb_build_object('action_id', a.id, 'symbol', e.symbol, 'event', 'drip',
                       'order_id', v_res->'order'->>'id'));
  return true;
end;
$$;
REVOKE ALL ON FUNCTION public.stock_drip_for_entitlement(uuid) FROM PUBLIC, anon, authenticated;

-- Cron cổ tức: thêm bước DRIP sau khi tiền đã về ví (giao dịch riêng).
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

  for r in
    select e.id from public.stock_dividend_entitlements e
      join public.stock_corporate_actions a on a.id = e.action_id
     where e.status = 'paid' and e.drip_note is null and a.action_type = 'CASH'
     order by e.paid_at
     limit 500
  loop
    perform public.stock_drip_for_entitlement(r.id);
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

-- Đánh dấu các quyền đã trả trước khi có DRIP để không tái đầu tư hồi tố.
UPDATE public.stock_dividend_entitlements SET drip_note = 'off' WHERE status = 'paid' AND drip_note IS NULL;

-- ───────────────────────── Báo cáo Admin ─────────────────────────

CREATE OR REPLACE FUNCTION public.admin_stock_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'investors', (select count(distinct user_id) from public.stock_positions where qty > 0),
    'market_value', (select coalesce(sum(p.qty * q.last_price), 0) from public.stock_positions p join public.stock_quotes q using (symbol)),
    'total_cost', (select coalesce(sum(total_cost), 0) from public.stock_positions),
    'realized_pnl', (select coalesce(sum(realized_pnl), 0) from public.stock_trades where side = 'SELL'),
    'buy_value', (select coalesce(sum(amount), 0) from public.stock_trades where side = 'BUY' and coalesce(source, 'order') = 'order'),
    'sell_value', (select coalesce(sum(amount), 0) from public.stock_trades where side = 'SELL'),
    'fees', (select coalesce(sum(fee), 0) from public.stock_trades),
    'sell_tax', (select coalesce(sum(tax), 0) from public.stock_trades),
    'pending_sale_cash', (select coalesce(sum(net_amount), 0) from public.stock_trades where side = 'SELL' and settled_at is null),
    'held_cash', (select coalesce(sum(hold_amount), 0) from public.stock_orders where status = 'pending' and side = 'BUY'),
    'pending_orders', (select count(*) from public.stock_orders where status = 'pending'),
    'dividends_paid', (select coalesce(sum(net), 0) from public.stock_dividend_entitlements where status = 'paid'),
    'dividend_tax', (select coalesce(sum(tax), 0) from public.stock_dividend_entitlements where status = 'paid'),
    'dividend_shares', (select coalesce(sum(shares), 0) from public.stock_dividend_entitlements where status = 'paid'),
    'drip_users', (select count(*) from public.stock_drip_settings where enabled),
    'by_symbol', (
      select coalesce(jsonb_agg(x order by x->>'symbol'), '[]'::jsonb) from (
        select jsonb_build_object(
          'symbol', q.symbol,
          'last_price', q.last_price,
          'holders', (select count(*) from public.stock_positions p where p.symbol = q.symbol and p.qty > 0),
          'shares', (select coalesce(sum(qty), 0) from public.stock_positions p where p.symbol = q.symbol),
          'cost', (select coalesce(sum(total_cost), 0) from public.stock_positions p where p.symbol = q.symbol),
          'traded_qty', (select coalesce(sum(qty), 0) from public.stock_trades t where t.symbol = q.symbol and coalesce(t.source, 'order') = 'order'),
          'watchers', (select count(*) from public.stock_watchlist w where w.symbol = q.symbol)
        ) as x
        from public.stock_quotes q
      ) s
    )
  ) into v;
  return v;
end;
$$;
REVOKE ALL ON FUNCTION public.admin_stock_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stock_report() TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_drip_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_watchlist;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
