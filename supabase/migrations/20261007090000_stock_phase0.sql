-- Chứng khoán - Giai đoạn 0 (docs/design/stock-investment-spec.md §0.2, §6).
--
-- 1. Lệnh mua trước đây trừ ví từ trình duyệt rồi ghi transactions với
--    project_id = 'stock_VRE' (id thật là 'p_stock_vre') => trigger
--    compute_transaction_interest từ chối, tiền đã trừ nhưng không có cổ phần.
--    Thay bằng RPC place_stock_order: kiểm tra mã + sức mua, trừ ví, ghi lệnh,
--    cộng nắm giữ và ghi lịch sử ví trong MỘT giao dịch Postgres.
-- 2. Cổ phiếu không dùng bảng transactions của Dự án nữa (tránh trigger lãi /
--    đáo hạn): bảng riêng stock_orders + stock_positions.
-- 3. Mã is_active = false => server từ chối đặt lệnh.
-- 4. Ghi lại 4 lần mua đã trừ ví (tổng 170.400.000 đ) thành cổ phần.
--
-- Biến động tiền vẫn đi qua increment_user_balance => trigger "Biến động số
-- dư" tự tạo thông báo + Web Push, ND lấy từ app.balance_memo.

CREATE TABLE IF NOT EXISTS public.stock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL DEFAULT 'BUY' CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL DEFAULT 'MP' CHECK (order_type IN ('LO', 'MP', 'ATO', 'ATC')),
  qty bigint NOT NULL CHECK (qty > 0),
  price numeric NOT NULL CHECK (price >= 0),
  amount bigint NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'filled' CHECK (status IN ('pending', 'filled', 'cancelled', 'rejected')),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'admin', 'backfill', 'drip')),
  charged boolean NOT NULL DEFAULT true,
  idempotency_key text,
  wallet_transaction_id text UNIQUE,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_orders_idem_uq ON public.stock_orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_orders_user_idx ON public.stock_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_orders_created_idx ON public.stock_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_positions (
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  project_id text NOT NULL,
  qty bigint NOT NULL DEFAULT 0 CHECK (qty >= 0),
  total_cost bigint NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

ALTER TABLE public.stock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_positions ENABLE ROW LEVEL SECURITY;

-- Chỉ đọc dòng của mình (Admin đọc tất cả). Không có policy ghi: mọi thay đổi
-- đi qua RPC SECURITY DEFINER.
DROP POLICY IF EXISTS stock_orders_select_own_or_admin ON public.stock_orders;
CREATE POLICY stock_orders_select_own_or_admin ON public.stock_orders
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS stock_positions_select_own_or_admin ON public.stock_positions;
CREATE POLICY stock_positions_select_own_or_admin ON public.stock_positions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.stock_orders, public.stock_positions FROM anon, authenticated;
GRANT SELECT ON public.stock_orders, public.stock_positions TO authenticated;

-- Lõi khớp lệnh mua MP (dùng chung cho người dùng và Admin). Gọi từ các RPC
-- bên dưới - không cấp quyền gọi trực tiếp.
CREATE OR REPLACE FUNCTION public.stock_fill_buy(
  p_user_id text,
  p_project_id text,
  p_qty bigint,
  p_charge boolean,
  p_source text,
  p_idempotency_key text,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_proj record;
  v_user record;
  v_symbol text;
  v_price numeric;
  v_amount bigint;
  v_order public.stock_orders;
  v_wtx_id text;
  v_memo text;
begin
  if p_qty is null or p_qty <= 0 or p_qty > 10000000 then
    raise exception 'INVALID_QTY' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select * into v_order from public.stock_orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true,
        'balance', (select balance from public.users where id = p_user_id));
    end if;
  end if;

  select id, category, is_active, stock_symbol, title, price_per_m2 into v_proj
    from public.investment_projects where id = p_project_id;
  if not found or btrim(coalesce(v_proj.category, '')) <> 'Đầu tư chứng khoán' then
    raise exception 'SYMBOL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_source = 'user' and v_proj.is_active is not true then
    raise exception 'SYMBOL_HALTED' using errcode = 'P0001';
  end if;

  v_symbol := upper(coalesce(nullif(btrim(v_proj.stock_symbol), ''),
                             (regexp_match(coalesce(v_proj.title, ''), '\(([^)]+)\)'))[1], 'CP'));
  v_price := round(coalesce(v_proj.price_per_m2, 0));
  if v_price <= 0 then
    raise exception 'PRICE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_amount := (v_price * p_qty)::bigint;

  select id, balance, is_locked into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_charge then
    if p_source = 'user' and v_user.is_locked then
      raise exception 'ACCOUNT_LOCKED' using errcode = 'P0001';
    end if;
    if coalesce(v_user.balance, 0) < v_amount then
      raise exception 'INSUFFICIENT_BUYING_POWER' using errcode = 'P0001';
    end if;

    v_memo := 'MUA CO PHIEU ' || v_symbol || ' SL ' || p_qty;
    perform set_config('app.balance_memo', v_memo, true);
    perform public.increment_user_balance(p_user_id, -v_amount, 0);

    v_wtx_id := 'stk_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.wallet_transactions (id, user_id, type, amount, status, description, category, note)
    values (v_wtx_id, p_user_id, 'investment', v_amount, 'completed',
            'Mua ' || p_qty || ' cổ phiếu ' || v_symbol, 'Đầu tư chứng khoán', p_note);
  end if;

  insert into public.stock_orders (user_id, project_id, symbol, side, order_type, qty, price, amount,
                                   status, source, charged, idempotency_key, wallet_transaction_id, note, created_by)
  values (p_user_id, v_proj.id, v_symbol, 'BUY', 'MP', p_qty, v_price, v_amount,
          'filled', p_source, p_charge, p_idempotency_key, v_wtx_id, p_note, auth.uid()::text)
  returning * into v_order;

  insert into public.stock_positions as sp (user_id, symbol, project_id, qty, total_cost)
  values (p_user_id, v_symbol, v_proj.id, p_qty, v_amount)
  on conflict (user_id, symbol) do update
    set qty = sp.qty + excluded.qty,
        total_cost = sp.total_cost + excluded.total_cost,
        project_id = excluded.project_id,
        updated_at = now();

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false,
    'balance', (select balance from public.users where id = p_user_id));
end;
$$;

REVOKE ALL ON FUNCTION public.stock_fill_buy(text, text, bigint, boolean, text, text, text) FROM PUBLIC, anon, authenticated;

-- Người dùng đặt lệnh mua (MP, khớp ngay theo giá hiện tại của mã).
CREATE OR REPLACE FUNCTION public.place_stock_order(
  p_project_id text,
  p_qty bigint,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  return public.stock_fill_buy(auth.uid()::text, p_project_id, p_qty, true, 'user',
                               nullif(btrim(coalesce(p_idempotency_key, '')), ''), null);
end;
$$;

REVOKE ALL ON FUNCTION public.place_stock_order(text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_stock_order(text, bigint, text) TO authenticated;

-- Admin cấp lệnh cho khách: có thể trừ ví hoặc chỉ ghi nhận cổ phần.
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
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return public.stock_fill_buy(p_user_id, p_project_id, p_qty, coalesce(p_charge_wallet, false), 'admin',
                               null, nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

REVOKE ALL ON FUNCTION public.admin_create_stock_order(text, text, bigint, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_stock_order(text, text, bigint, boolean, text) TO authenticated;

-- Ghi lại các lần mua đã trừ ví nhưng chưa có cổ phần (luồng cũ): mỗi dòng
-- wallet_transactions "Mua <SL> cổ phiếu <MÃ>" chưa gắn lệnh nào => 1 lệnh
-- 'backfill' (không trừ ví lần nữa) với đúng SL và số tiền đã trừ.
-- wallet_transaction_id UNIQUE => chạy lại không ghi trùng.
WITH legacy AS (
  SELECT w.id AS wtx_id, w.user_id, w.amount, w.created_date,
         (regexp_match(w.description, '^Mua ([0-9]+) cổ phiếu ([A-Z0-9]+)$'))[1]::bigint AS qty,
         (regexp_match(w.description, '^Mua ([0-9]+) cổ phiếu ([A-Z0-9]+)$'))[2] AS symbol
    FROM public.wallet_transactions w
   WHERE w.type = 'investment'
     AND w.status = 'completed'
     AND w.description ~ '^Mua [0-9]+ cổ phiếu [A-Z0-9]+$'
     AND NOT EXISTS (SELECT 1 FROM public.stock_orders o WHERE o.wallet_transaction_id = w.id)
), resolved AS (
  SELECT l.*, p.id AS project_id
    FROM legacy l
    JOIN public.investment_projects p
      ON btrim(p.category) = 'Đầu tư chứng khoán' AND upper(p.stock_symbol) = l.symbol
    JOIN public.users u ON u.id = l.user_id
   WHERE l.qty > 0
), ins AS (
  INSERT INTO public.stock_orders (user_id, project_id, symbol, side, order_type, qty, price, amount,
                                   status, source, charged, wallet_transaction_id, note, created_at)
  SELECT user_id, project_id, symbol, 'BUY', 'MP', qty, round(amount::numeric / qty, 2), amount,
         'filled', 'backfill', true, wtx_id,
         'Ghi nhận lại lệnh mua đã trừ ví (lỗi luồng mua cũ)', created_date
    FROM resolved
  RETURNING user_id, symbol, project_id, qty, amount
)
INSERT INTO public.stock_positions AS sp (user_id, symbol, project_id, qty, total_cost)
SELECT user_id, symbol, max(project_id), sum(qty), sum(amount) FROM ins GROUP BY user_id, symbol
ON CONFLICT (user_id, symbol) DO UPDATE
  SET qty = sp.qty + excluded.qty,
      total_cost = sp.total_cost + excluded.total_cost,
      updated_at = now();

UPDATE public.wallet_transactions w
   SET category = 'Đầu tư chứng khoán'
  FROM public.stock_orders o
 WHERE o.wallet_transaction_id = w.id AND w.category IS NULL;

-- Realtime cho màn "Cổ phiếu của tôi" và tab Admin.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_positions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
