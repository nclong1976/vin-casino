-- Ưu đãi phúc lợi - Giai đoạn 1: danh mục ưu đãi theo hạng thành viên +
-- nhận voucher thật (mã riêng, hạn dùng) vào "Ví ưu đãi" của người chơi.
--
-- Hạng = users.membership_tier (Admin gán: Member | Gold | Platinum | Diamond,
-- xem src/lib/membershipUtils.js). Ưu đãi có min_tier: hạng thấp hơn chỉ
-- xem được (khoá). Giới hạn: monthly_limit lượt / người / tháng (giờ VN,
-- NULL = không giới hạn) và total_stock tổng suất (NULL = không giới hạn).
-- Người chơi KHÔNG ghi trực tiếp vào bảng - chỉ qua claim_welfare_offer().

CREATE TABLE IF NOT EXISTS public.welfare_offers (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'shopping'
    CHECK (category IN ('resort', 'dining', 'shopping', 'health', 'casino', 'event')),
  badge text,
  min_tier text NOT NULL DEFAULT 'MEMBER' CHECK (min_tier IN ('MEMBER', 'GOLD', 'PLATINUM', 'DIAMOND')),
  monthly_limit integer CHECK (monthly_limit IS NULL OR monthly_limit > 0),
  total_stock integer CHECK (total_stock IS NULL OR total_stock >= 0),
  valid_days integer NOT NULL DEFAULT 30 CHECK (valid_days BETWEEN 1 AND 365),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.welfare_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id text NOT NULL REFERENCES public.welfare_offers(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  offer_title text NOT NULL,
  offer_category text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by text
);

CREATE INDEX IF NOT EXISTS welfare_claims_user_idx ON public.welfare_claims (user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS welfare_claims_offer_idx ON public.welfare_claims (offer_id, user_id, claimed_at);

ALTER TABLE public.welfare_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS welfare_offers_read ON public.welfare_offers;
CREATE POLICY welfare_offers_read ON public.welfare_offers
  FOR SELECT TO authenticated USING (is_active OR public.is_admin());
DROP POLICY IF EXISTS welfare_offers_admin ON public.welfare_offers;
CREATE POLICY welfare_offers_admin ON public.welfare_offers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS welfare_claims_read ON public.welfare_claims;
CREATE POLICY welfare_claims_read ON public.welfare_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text OR public.is_admin());
DROP POLICY IF EXISTS welfare_claims_admin ON public.welfare_claims;
CREATE POLICY welfare_claims_admin ON public.welfare_claims
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.welfare_offers, public.welfare_claims FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welfare_offers TO authenticated;
-- Supabase mặc định cấp mọi quyền cho authenticated trên bảng mới - thu lại
-- INSERT/DELETE: voucher chỉ được tạo qua claim_welfare_offer().
REVOKE INSERT, DELETE ON public.welfare_claims FROM authenticated;
GRANT SELECT, UPDATE ON public.welfare_claims TO authenticated;

-- Thứ bậc hạng - khớp normalizeTierKey() trong membershipUtils.js.
CREATE OR REPLACE FUNCTION public.welfare_tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  select case
    when upper(coalesce(p_tier, '')) like '%DIAMOND%' or upper(coalesce(p_tier, '')) like '%KIM CƯƠNG%' then 3
    when upper(coalesce(p_tier, '')) like '%PLATINUM%' or upper(coalesce(p_tier, '')) like '%BẠCH KIM%' then 2
    when upper(coalesce(p_tier, '')) like '%GOLD%' or upper(coalesce(p_tier, '')) like '%VÀNG%' then 1
    else 0
  end
$$;

-- Đầu tháng hiện tại theo giờ Việt Nam (mốc tính lượt nhận/tháng).
CREATE OR REPLACE FUNCTION public.welfare_month_start()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  select date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'
$$;

-- Danh mục ưu đãi kèm trạng thái của người đang xem: còn bao nhiêu suất,
-- đã nhận mấy lượt tháng này, có nhận được không và vì sao.
CREATE OR REPLACE FUNCTION public.get_welfare_offers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_rank integer;
  v_month timestamptz := public.welfare_month_start();
  v_offers jsonb;
begin
  if v_uid is null then
    raise exception 'Vui lòng đăng nhập';
  end if;
  select public.welfare_tier_rank(membership_tier) into v_rank from public.users where id = v_uid;
  v_rank := coalesce(v_rank, 0);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order, x.id), '[]'::jsonb)
    into v_offers
  from (
    select o.id, o.title, o.description, o.terms, o.category, o.badge, o.min_tier,
           o.monthly_limit, o.total_stock, o.valid_days, o.starts_at, o.ends_at, o.sort_order,
           case when o.total_stock is null then null
                else greatest(o.total_stock - (select count(*) from public.welfare_claims c where c.offer_id = o.id), 0)
           end as remaining,
           (select count(*) from public.welfare_claims c
             where c.offer_id = o.id and c.user_id = v_uid and c.claimed_at >= v_month) as my_month_count,
           v_rank >= public.welfare_tier_rank(o.min_tier) as eligible
    from public.welfare_offers o
    where o.is_active
      and (o.ends_at is null or o.ends_at > now())
  ) x;

  return jsonb_build_object('tier_rank', v_rank, 'offers', v_offers);
end;
$$;

-- Nhận 1 ưu đãi: kiểm tra hạng, thời gian, tổng suất, lượt/tháng rồi phát
-- voucher có mã riêng. Khoá dòng ưu đãi (FOR UPDATE) để 2 người bấm cùng
-- lúc không vượt tổng suất.
CREATE OR REPLACE FUNCTION public.claim_welfare_offer(p_offer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  v_user record;
  o public.welfare_offers%rowtype;
  v_used integer;
  v_code text;
  v_claim public.welfare_claims%rowtype;
begin
  if v_uid is null then
    raise exception 'Vui lòng đăng nhập';
  end if;
  select id, membership_tier, coalesce(is_locked, false) as is_locked into v_user from public.users where id = v_uid;
  if not found then
    raise exception 'Không tìm thấy tài khoản';
  end if;
  if v_user.is_locked then
    raise exception 'Tài khoản đang bị tạm khoá';
  end if;

  select * into o from public.welfare_offers where id = p_offer_id for update;
  if not found or not o.is_active then
    raise exception 'Ưu đãi không còn áp dụng';
  end if;
  if o.starts_at is not null and o.starts_at > now() then
    raise exception 'Ưu đãi chưa bắt đầu';
  end if;
  if o.ends_at is not null and o.ends_at <= now() then
    raise exception 'Ưu đãi đã kết thúc';
  end if;
  if public.welfare_tier_rank(v_user.membership_tier) < public.welfare_tier_rank(o.min_tier) then
    raise exception 'Ưu đãi dành cho hạng thành viên cao hơn';
  end if;
  if o.total_stock is not null then
    select count(*) into v_used from public.welfare_claims where offer_id = o.id;
    if v_used >= o.total_stock then
      raise exception 'Ưu đãi đã hết suất';
    end if;
  end if;
  if o.monthly_limit is not null then
    select count(*) into v_used from public.welfare_claims
     where offer_id = o.id and user_id = v_uid and claimed_at >= public.welfare_month_start();
    if v_used >= o.monthly_limit then
      raise exception 'Bạn đã nhận hết lượt ưu đãi này trong tháng';
    end if;
  end if;

  loop
    v_code := 'VCU' || upper(substr(md5(random()::text || clock_timestamp()::text || v_uid), 1, 8));
    exit when not exists (select 1 from public.welfare_claims where code = v_code);
  end loop;

  insert into public.welfare_claims (offer_id, user_id, code, offer_title, offer_category, expires_at)
  values (o.id, v_uid, v_code, o.title, o.category,
          least(now() + make_interval(days => o.valid_days), coalesce(o.ends_at, 'infinity'::timestamptz)))
  returning * into v_claim;

  return row_to_json(v_claim)::jsonb;
end;
$$;

REVOKE ALL ON FUNCTION public.get_welfare_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_welfare_offers() TO authenticated;
REVOKE ALL ON FUNCTION public.claim_welfare_offer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_welfare_offer(text) TO authenticated;

-- Danh mục ban đầu - theo quyền lợi từng hạng đang ghi ở membershipUtils.js.
-- Admin sửa / thêm ở Giai đoạn 2.
INSERT INTO public.welfare_offers (id, title, description, terms, category, badge, min_tier, monthly_limit, total_stock, valid_days, sort_order) VALUES
  ('ecosystem-10', 'Ưu đãi 10% hệ sinh thái', 'Giảm 10% dịch vụ trong hệ sinh thái VinClub',
   'Xuất trình mã voucher khi thanh toán. Không cộng dồn với khuyến mãi khác.', 'shopping', NULL, 'MEMBER', 4, NULL, 30, 10),
  ('shopping-500k', 'Voucher mua sắm 500K', 'Áp dụng cho hoá đơn từ 1.000.000 ₫',
   'Mỗi hoá đơn dùng 1 voucher. Không quy đổi thành tiền mặt.', 'shopping', 'MỚI', 'MEMBER', 1, 200, 30, 20),
  ('resort-30', 'Giảm 30% nghỉ dưỡng', 'Phòng Deluxe trở lên tại khu nghỉ dưỡng đối tác',
   'Đặt phòng qua CSKH VinClub, báo mã voucher khi đặt. Không áp dụng lễ, Tết.', 'resort', 'HOT', 'GOLD', 1, NULL, 60, 30),
  ('buffet-2for1', 'Buffet 2-for-1', 'Đi 2 người, thanh toán 1 suất buffet',
   'Áp dụng buffet tối, đặt bàn trước 24 giờ.', 'dining', NULL, 'GOLD', 1, NULL, 30, 40),
  ('casino-entry', 'Vé vào cửa Casino Corona', 'Vé vào cửa tự do Corona Casino Phú Quốc',
   'Xuất trình mã cùng giấy tờ tuỳ thân tại quầy lễ tân casino.', 'casino', 'VIP', 'GOLD', 2, NULL, 30, 50),
  ('health-checkup', 'Khám sức khoẻ miễn phí', 'Gói khám tổng quát toàn diện',
   'Đặt lịch trước qua CSKH VinClub. Mỗi voucher dùng cho 1 người.', 'health', NULL, 'PLATINUM', 1, 50, 60, 60),
  ('casino-lounge', 'Phòng chờ VIP Casino', 'Sử dụng phòng chờ VIP tại Casino Corona',
   'Xuất trình mã tại quầy phòng chờ VIP.', 'casino', NULL, 'PLATINUM', NULL, NULL, 30, 70),
  ('resort-50', 'Giảm 50% nghỉ dưỡng & Casino VIP', 'Đặc quyền hạng Kim Cương',
   'Đặt dịch vụ qua CSKH VinClub, báo mã voucher khi đặt.', 'resort', 'VIP', 'DIAMOND', 2, NULL, 60, 80),
  ('vip-event', 'Thẻ mời sự kiện độc quyền', 'Tham dự sự kiện dành riêng hội viên Kim Cương',
   'CSKH sẽ liên hệ xác nhận lịch sự kiện sau khi nhận.', 'event', NULL, 'DIAMOND', 1, 20, 90, 90)
ON CONFLICT (id) DO NOTHING;
