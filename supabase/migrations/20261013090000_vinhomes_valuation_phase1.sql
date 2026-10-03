-- Vinhomes "Định giá thử" - Giai đoạn 1: dữ liệu + hàm định giá chạy trên
-- máy chủ (form và báo cáo ở src/components/projects/ValuationModal.jsx).
--
-- Mọi hệ số, biên độ, tỉ suất thuê, tiến độ thanh toán, gói vay đều là CẤU
-- HÌNH do Admin đặt - giá trị khởi tạo dưới đây chỉ là mặc định tham khảo,
-- không phải giá chào bán / lãi suất ngân hàng thật. Đơn giá gốc lấy từ
-- investment_projects.price_per_m2 (Admin sửa ở tab Dự án).
--
-- Không ghi gì vào investment_projects.extra.

-- ───────────── Bảng ─────────────

CREATE TABLE IF NOT EXISTS public.vh_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Loại hình phân khu có bán: apartment | shophouse | villa
  types text[] NOT NULL DEFAULT ARRAY['apartment', 'shophouse', 'villa'],
  k_zone numeric NOT NULL DEFAULT 1 CHECK (k_zone > 0 AND k_zone < 5),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vh_zones_project_idx ON public.vh_zones(project_id, sort_order);

CREATE TABLE IF NOT EXISTS public.vh_units (
  project_id text NOT NULL REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  code text NOT NULL,
  zone_id uuid REFERENCES public.vh_zones(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('apartment', 'shophouse', 'villa')),
  area numeric NOT NULL CHECK (area > 0),
  direction text NOT NULL CHECK (direction IN ('D', 'T', 'N', 'B', 'DN', 'DB', 'TN', 'TB')),
  floor int,
  is_corner boolean NOT NULL DEFAULT false,
  view text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  PRIMARY KEY (project_id, code)
);

-- Đơn giá theo tháng (mỗi loại hình một dòng / tháng).
CREATE TABLE IF NOT EXISTS public.vh_price_history (
  project_id text NOT NULL REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('apartment', 'shophouse', 'villa')),
  month date NOT NULL,
  price_per_m2 numeric NOT NULL CHECK (price_per_m2 > 0),
  PRIMARY KEY (project_id, type, month)
);

CREATE TABLE IF NOT EXISTS public.vh_valuation_config (
  project_id text PRIMARY KEY REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  -- Hệ số loại hình / hướng / hướng nhìn: { key: hệ số }
  k_type jsonb NOT NULL,
  k_dir jsonb NOT NULL,
  k_view jsonb NOT NULL,
  corner_factor numeric NOT NULL DEFAULT 1.08,
  floor_step_pct numeric NOT NULL DEFAULT 0.3,   -- +%/tầng (chỉ căn hộ, từ tầng 2)
  floor_cap_pct numeric NOT NULL DEFAULT 6,      -- tối đa +% theo tầng
  band_pct numeric NOT NULL DEFAULT 6 CHECK (band_pct >= 0 AND band_pct <= 30),
  -- Khoảng diện tích theo loại hình: { type: [min, max] }
  area_ranges jsonb NOT NULL,
  rent_yield jsonb NOT NULL,                     -- %/năm theo loại hình
  vacancy_pct numeric NOT NULL DEFAULT 10,
  opex_pct numeric NOT NULL DEFAULT 1,           -- chi phí vận hành %/năm trên giá trị
  growth_pct numeric NOT NULL DEFAULT 5,         -- tăng giá/năm khi chưa đủ lịch sử
  payment_schedule jsonb NOT NULL,               -- [{label, pct, month}] tổng 100
  early_discount_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vh_loan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  max_ltv numeric NOT NULL CHECK (max_ltv > 0 AND max_ltv <= 0.9),
  years int NOT NULL CHECK (years BETWEEN 1 AND 35),
  promo_rate numeric NOT NULL CHECK (promo_rate >= 0 AND promo_rate < 30),  -- %/năm
  promo_months int NOT NULL DEFAULT 0 CHECK (promo_months >= 0),
  float_rate numeric NOT NULL CHECK (float_rate >= 0 AND float_rate < 30),  -- %/năm sau ưu đãi
  source_note text NOT NULL DEFAULT 'Lãi suất minh hoạ do VinClub cấu hình',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

-- Khách bấm Tư vấn / Nhận thông báo / Đặt chỗ sau khi định giá.
CREATE TABLE IF NOT EXISTS public.vh_valuation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  project_id text NOT NULL REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('consult', 'notify', 'reserve')),
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vh_valuation_requests_user_idx ON public.vh_valuation_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vh_valuation_requests_project_idx ON public.vh_valuation_requests(project_id, created_at DESC);

-- ───────────── Quyền ─────────────

ALTER TABLE public.vh_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_valuation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_valuation_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vh_zones', 'vh_units', 'vh_price_history', 'vh_valuation_config', 'vh_loan_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vh_valuation_requests' AND policyname = 'vh_valuation_requests_read') THEN
    CREATE POLICY vh_valuation_requests_read ON public.vh_valuation_requests
      FOR SELECT TO authenticated USING (user_id = auth.uid()::text OR public.is_admin());
  END IF;
END $$;

-- ───────────── Hàm định giá ─────────────

-- Trả góp đều theo tháng: dư nợ L, lãi năm r%, còn n tháng.
CREATE OR REPLACE FUNCTION public.vh_annuity(p_balance numeric, p_rate_pct numeric, p_months int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  select case
    when p_months <= 0 then 0
    when p_rate_pct = 0 then p_balance / p_months
    else p_balance * (p_rate_pct / 1200) / (1 - power(1 + p_rate_pct / 1200, -p_months))
  end;
$$;

-- Mô phỏng khoản vay: lãi ưu đãi promo_months tháng đầu, sau đó thả nổi;
-- tiền trả được tính lại khi đổi lãi suất trên dư nợ còn lại.
CREATE OR REPLACE FUNCTION public.vh_loan_plan(p_value numeric, p_loan public.vh_loan_products)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
declare
  v_amount numeric := round(p_value * p_loan.max_ltv, -6);
  v_n int := p_loan.years * 12;
  v_bal numeric := v_amount;
  v_rate numeric;
  v_pay numeric := 0;
  v_first numeric := 0;
  v_after numeric := null;
  v_interest numeric := 0;
  v_int numeric;
  i int;
begin
  for i in 1..v_n loop
    if i = 1 or i = p_loan.promo_months + 1 then
      v_rate := case when i <= p_loan.promo_months then p_loan.promo_rate else p_loan.float_rate end;
      v_pay := public.vh_annuity(v_bal, v_rate, v_n - i + 1);
      if i = 1 then v_first := v_pay; else v_after := v_pay; end if;
    end if;
    v_int := v_bal * v_rate / 1200;
    v_interest := v_interest + v_int;
    v_bal := v_bal - (v_pay - v_int);
  end loop;
  return jsonb_build_object(
    'id', p_loan.id, 'name', p_loan.name, 'source_note', p_loan.source_note,
    'ltv', p_loan.max_ltv, 'years', p_loan.years,
    'promo_rate', p_loan.promo_rate, 'promo_months', p_loan.promo_months, 'float_rate', p_loan.float_rate,
    'amount', v_amount, 'equity', p_value - v_amount,
    'monthly_first', round(v_first), 'monthly_after', round(coalesce(v_after, v_first)),
    'total_interest', round(v_interest)
  );
end;
$$;

/**
 * Định giá 1 căn. Chọn mã căn (p_unit_code) thì loại hình / diện tích /
 * hướng / tầng / góc / hướng nhìn / phân khu lấy theo căn đó.
 * Lỗi trả về dạng 'VH_...' để giao diện dịch sang lời thường.
 */
CREATE OR REPLACE FUNCTION public.valuate_unit(
  p_project_id text,
  p_type text,
  p_area numeric,
  p_direction text,
  p_zone_id uuid DEFAULT NULL,
  p_unit_code text DEFAULT NULL,
  p_floor int DEFAULT NULL,
  p_is_corner boolean DEFAULT false,
  p_view text DEFAULT 'none',
  p_years int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_proj record;
  v_cfg public.vh_valuation_config;
  v_unit public.vh_units;
  v_zone public.vh_zones;
  v_type text := p_type;
  v_area numeric := p_area;
  v_dir text := p_direction;
  v_zone_id uuid := p_zone_id;
  v_floor int := p_floor;
  v_corner boolean := coalesce(p_is_corner, false);
  v_view text := coalesce(nullif(p_view, ''), 'none');
  v_years int := least(greatest(coalesce(p_years, 5), 1), 20);
  v_range jsonb;
  k_zone numeric := 1;
  k_type numeric;
  k_dir numeric;
  k_pos numeric := 1;
  k_view numeric;
  v_unit_price numeric;
  v_value numeric;
  v_hist record;
  v_months numeric;
  v_cagr numeric;
  v_g numeric;
  v_yield numeric;
  v_rent_net numeric;
  v_scen jsonb := '[]'::jsonb;
  v_sched jsonb := '[]'::jsonb;
  v_loans jsonb := '[]'::jsonb;
  v_hist_pts jsonb;
  s record;
  l public.vh_loan_products;
begin
  select id, title, category, price_per_m2, total_term_interest_rate, term_duration_minutes, is_active
    into v_proj from public.investment_projects where id = p_project_id;
  if not found or coalesce(trim(v_proj.category), '') <> 'VinHomes' then
    raise exception 'VH_PROJECT_NOT_FOUND';
  end if;
  if not (coalesce(v_proj.price_per_m2, 0) > 0) then
    raise exception 'VH_NO_BASE_PRICE';
  end if;
  select * into v_cfg from public.vh_valuation_config where project_id = p_project_id;
  if not found then
    raise exception 'VH_NO_CONFIG';
  end if;

  if nullif(trim(p_unit_code), '') is not null then
    select * into v_unit from public.vh_units where project_id = p_project_id and code = upper(trim(p_unit_code));
    if not found then
      raise exception 'VH_UNIT_NOT_FOUND';
    end if;
    v_type := v_unit.type;
    v_area := v_unit.area;
    v_dir := v_unit.direction;
    v_zone_id := coalesce(v_unit.zone_id, v_zone_id);
    v_floor := v_unit.floor;
    v_corner := v_unit.is_corner;
    v_view := v_unit.view;
  end if;

  k_type := (v_cfg.k_type ->> v_type)::numeric;
  if k_type is null then
    raise exception 'VH_BAD_TYPE';
  end if;
  k_dir := (v_cfg.k_dir ->> v_dir)::numeric;
  if k_dir is null then
    raise exception 'VH_BAD_DIRECTION';
  end if;
  k_view := coalesce((v_cfg.k_view ->> v_view)::numeric, 1);

  v_range := v_cfg.area_ranges -> v_type;
  if v_unit.code is null and v_range is not null
     and (v_area is null or v_area < (v_range ->> 0)::numeric or v_area > (v_range ->> 1)::numeric) then
    raise exception 'VH_BAD_AREA';
  end if;

  if v_zone_id is not null then
    select * into v_zone from public.vh_zones where id = v_zone_id and project_id = p_project_id;
    if not found then
      raise exception 'VH_ZONE_NOT_FOUND';
    end if;
    if not (v_type = any(v_zone.types)) then
      raise exception 'VH_TYPE_NOT_IN_ZONE';
    end if;
    k_zone := v_zone.k_zone;
  end if;

  if v_corner then
    k_pos := k_pos * v_cfg.corner_factor;
  end if;
  if v_type = 'apartment' and coalesce(v_floor, 1) > 1 then
    k_pos := k_pos * (1 + least(v_cfg.floor_step_pct * (v_floor - 1), v_cfg.floor_cap_pct) / 100);
  end if;

  -- Đơn giá áp dụng làm tròn tới nghìn đồng.
  v_unit_price := round(v_proj.price_per_m2 * k_zone * k_type * k_dir * k_pos * k_view, -3);
  v_value := round(v_area * v_unit_price);

  -- Lịch sử giá (theo loại hình).
  select (array_agg(price_per_m2 order by month))[1] as first_p,
         (array_agg(price_per_m2 order by month desc))[1] as last_p,
         min(month) as first_m, max(month) as last_m,
         max(price_per_m2) as high, min(price_per_m2) as low, count(*) as n
    into v_hist
    from public.vh_price_history where project_id = p_project_id and type = v_type;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'price_per_m2', price_per_m2) order by month), '[]'::jsonb)
    into v_hist_pts
    from (select month, price_per_m2 from public.vh_price_history
           where project_id = p_project_id and type = v_type order by month desc limit 36) h;
  if v_hist.n >= 2 and v_hist.first_p > 0 then
    v_months := (extract(year from age(v_hist.last_m, v_hist.first_m)) * 12 + extract(month from age(v_hist.last_m, v_hist.first_m)));
    if v_months >= 1 then
      v_cagr := power(v_hist.last_p / v_hist.first_p, 12 / v_months) - 1;
    end if;
  end if;

  -- Dự phóng: tăng giá g (CAGR nếu có, không thì cấu hình) x hệ số kịch bản;
  -- tiền thuê ròng/năm giữ nguyên theo giá trị hiện tại.
  v_g := coalesce(v_cagr, v_cfg.growth_pct / 100);
  v_yield := coalesce((v_cfg.rent_yield ->> v_type)::numeric, 0);
  v_rent_net := v_value * v_yield / 100 * (1 - v_cfg.vacancy_pct / 100) - v_value * v_cfg.opex_pct / 100;
  for s in select * from (values ('conservative', 0.5), ('base', 1.0), ('optimistic', 1.3)) as x(name, m) loop
    v_scen := v_scen || jsonb_build_object(
      'name', s.name,
      'growth_pct', round(v_g * s.m * 100, 2),
      'value_end', round(v_value * power(1 + v_g * s.m, v_years)),
      'rent_net_total', round(v_rent_net * v_years),
      'profit', round(v_value * power(1 + v_g * s.m, v_years) - v_value + v_rent_net * v_years)
    );
  end loop;

  -- Tiến độ thanh toán.
  select coalesce(jsonb_agg(jsonb_build_object(
           'label', e ->> 'label', 'pct', (e ->> 'pct')::numeric, 'month', (e ->> 'month')::int,
           'amount', round(v_value * (e ->> 'pct')::numeric / 100)) order by ord), '[]'::jsonb)
    into v_sched
    from jsonb_array_elements(v_cfg.payment_schedule) with ordinality as t(e, ord);

  -- Gói vay đang bật, xếp theo tổng tiền lãi.
  for l in select * from public.vh_loan_products where is_active order by sort_order, name loop
    v_loans := v_loans || public.vh_loan_plan(v_value, l);
  end loop;
  select coalesce(jsonb_agg(x order by (x ->> 'total_interest')::numeric), '[]'::jsonb) into v_loans
    from jsonb_array_elements(v_loans) x;

  return jsonb_build_object(
    'project', jsonb_build_object('id', v_proj.id, 'title', v_proj.title, 'is_active', coalesce(v_proj.is_active, true),
                                  'term_rate_pct', v_proj.total_term_interest_rate, 'term_minutes', v_proj.term_duration_minutes),
    'input', jsonb_build_object('type', v_type, 'area', v_area, 'direction', v_dir, 'zone_id', v_zone_id,
                                'zone_name', v_zone.name, 'unit_code', v_unit.code, 'floor', v_floor,
                                'is_corner', v_corner, 'view', v_view, 'years', v_years),
    'unit_price', jsonb_build_object('base', v_proj.price_per_m2, 'applied', v_unit_price,
                   'factors', jsonb_build_object('k_zone', k_zone, 'k_type', k_type, 'k_dir', k_dir,
                                                 'k_pos', round(k_pos, 4), 'k_view', k_view)),
    'value', jsonb_build_object('estimate', v_value, 'band_pct', v_cfg.band_pct,
                                'floor', round(v_value * (1 - v_cfg.band_pct / 100), -6),
                                'ceiling', round(v_value * (1 + v_cfg.band_pct / 100), -6)),
    'history', jsonb_build_object('points', v_hist_pts, 'cagr_pct', round(v_cagr * 100, 2),
                                  'high', v_hist.high, 'low', v_hist.low, 'count', coalesce(v_hist.n, 0)),
    'projection', jsonb_build_object('years', v_years, 'growth_source', case when v_cagr is null then 'config' else 'history' end,
                                     'rent_yield_pct', v_yield, 'rent_net_year', round(v_rent_net), 'scenarios', v_scen),
    'payment', jsonb_build_object('schedule', v_sched, 'early_discount_pct', v_cfg.early_discount_pct,
                                  'early_total', round(v_value * (1 - v_cfg.early_discount_pct / 100))),
    'loans', v_loans,
    'config_updated_at', v_cfg.updated_at
  );
end;
$$;

/** Dữ liệu cho form định giá của 1 dự án (phân khu, mã căn, khoảng diện tích, hướng...). */
CREATE OR REPLACE FUNCTION public.get_vh_valuation_form(p_project_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case when c.project_id is null then null else jsonb_build_object(
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'types', z.types) order by z.sort_order, z.name)
                         from public.vh_zones z where z.project_id = p_project_id), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(jsonb_build_object('code', u.code, 'type', u.type, 'area', u.area, 'direction', u.direction,
                                                           'floor', u.floor, 'zone_id', u.zone_id, 'status', u.status) order by u.code)
                         from public.vh_units u where u.project_id = p_project_id and u.status <> 'sold'), '[]'::jsonb),
    'types', (select jsonb_agg(k order by k) from jsonb_object_keys(c.k_type) k),
    'directions', (select jsonb_agg(k) from jsonb_object_keys(c.k_dir) k),
    'views', (select jsonb_agg(k) from jsonb_object_keys(c.k_view) k),
    'area_ranges', c.area_ranges,
    'updated_at', c.updated_at
  ) end
  from (select 1) one
  left join public.vh_valuation_config c on c.project_id = p_project_id;
$$;

/**
 * Khách bấm Tư vấn / Nhận thông báo / Đặt chỗ: tính lại trên máy chủ từ đầu
 * vào (không tin kết quả client gửi) rồi lưu cho Admin theo dõi.
 */
CREATE OR REPLACE FUNCTION public.create_vh_lead(p_project_id text, p_action text, p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_result jsonb;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'VH_LOGIN_REQUIRED';
  end if;
  if p_action not in ('consult', 'notify', 'reserve') then
    raise exception 'VH_BAD_ACTION';
  end if;
  -- Chặn bấm lặp: cùng dự án + hành động trong 1 phút trả lại yêu cầu cũ.
  select id into v_id from public.vh_valuation_requests
   where user_id = v_uid and project_id = p_project_id and action = p_action and created_at > now() - interval '1 minute'
   order by created_at desc limit 1;
  if found then
    return v_id;
  end if;
  v_result := public.valuate_unit(
    p_project_id,
    p_input ->> 'type',
    (p_input ->> 'area')::numeric,
    p_input ->> 'direction',
    nullif(p_input ->> 'zone_id', '')::uuid,
    nullif(p_input ->> 'unit_code', ''),
    nullif(p_input ->> 'floor', '')::int,
    coalesce((p_input ->> 'is_corner')::boolean, false),
    coalesce(nullif(p_input ->> 'view', ''), 'none'),
    coalesce(nullif(p_input ->> 'years', '')::int, 5)
  );
  insert into public.vh_valuation_requests (user_id, project_id, action, input, result)
  values (v_uid, p_project_id, p_action, v_result -> 'input', v_result)
  returning id into v_id;
  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.valuate_unit(text, text, numeric, text, uuid, text, int, boolean, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_vh_valuation_form(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_vh_lead(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valuate_unit(text, text, numeric, text, uuid, text, int, boolean, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vh_valuation_form(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vh_lead(text, text, jsonb) TO authenticated;

-- ───────────── Cấu hình mặc định (Admin chỉnh lại) ─────────────

INSERT INTO public.vh_valuation_config (project_id, k_type, k_dir, k_view, area_ranges, rent_yield, payment_schedule, early_discount_pct)
SELECT p.id,
  '{"apartment": 1.00, "shophouse": 1.35, "villa": 1.20}'::jsonb,
  '{"DN": 1.03, "N": 1.02, "D": 1.01, "B": 1.00, "DB": 1.00, "TN": 0.99, "TB": 0.98, "T": 0.97}'::jsonb,
  '{"none": 1.00, "park": 1.04, "lake": 1.06, "sea": 1.10}'::jsonb,
  '{"apartment": [45, 120], "shophouse": [75, 150], "villa": [150, 400]}'::jsonb,
  '{"apartment": 4.5, "shophouse": 6.0, "villa": 3.5}'::jsonb,
  '[{"label": "Ký hợp đồng mua bán", "pct": 20, "month": 0},
    {"label": "Đợt 2", "pct": 10, "month": 3},
    {"label": "Đợt 3", "pct": 10, "month": 6},
    {"label": "Nhận nhà", "pct": 55, "month": 18},
    {"label": "Nhận sổ hồng", "pct": 5, "month": 30}]'::jsonb,
  5
FROM public.investment_projects p
WHERE trim(p.category) = 'VinHomes'
ON CONFLICT (project_id) DO NOTHING;

-- Mỗi dự án 1 phân khu "Toàn dự án" để định giá được ngay; Admin thêm phân khu thật sau.
INSERT INTO public.vh_zones (project_id, name, k_zone)
SELECT p.id, 'Toàn dự án', 1
FROM public.investment_projects p
WHERE trim(p.category) = 'VinHomes'
  AND NOT EXISTS (SELECT 1 FROM public.vh_zones z WHERE z.project_id = p.id);

-- Điểm giá đầu tiên = đơn giá hiện tại x hệ số loại hình (tháng này). Lịch sử
-- dài hơn do Admin nhập; khi chưa đủ 2 điểm, dự phóng dùng growth_pct cấu hình.
INSERT INTO public.vh_price_history (project_id, type, month, price_per_m2)
SELECT p.id, t.type, date_trunc('month', now())::date, round(p.price_per_m2 * t.k, -3)
FROM public.investment_projects p
CROSS JOIN (VALUES ('apartment', 1.00), ('shophouse', 1.35), ('villa', 1.20)) AS t(type, k)
WHERE trim(p.category) = 'VinHomes' AND p.price_per_m2 > 0
ON CONFLICT DO NOTHING;

INSERT INTO public.vh_loan_products (name, max_ltv, years, promo_rate, promo_months, float_rate, sort_order)
SELECT * FROM (VALUES
  ('Gói vay A – ưu đãi 12 tháng', 0.70, 20, 7.5, 12, 10.5, 1),
  ('Gói vay B – ưu đãi 24 tháng', 0.65, 25, 8.5, 24, 10.0, 2)
) v(name, max_ltv, years, promo_rate, promo_months, float_rate, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.vh_loan_products);
