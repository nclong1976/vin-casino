-- Sa bàn (masterplan) cho bản đồ dự án + dữ liệu Vinhomes Golden City.
--
-- vh_project_geo.masterplan (jsonb):
--   { "image_url": string|null,         -- ảnh mặt bằng thật do Admin tải (nếu có quyền dùng)
--     "illustrative": bool,             -- true = sơ đồ minh hoạ, không theo tỉ lệ
--     "markers": [ { "id", "kind": "zone"|"amenity"|"lake"|"park"|"road",
--                    "x", "y" (0..100, % theo chiều ngang / dọc),
--                    "r" (bán kính %, cho zone/lake/park), "label", "icon", "zone_id" } ] }
--
-- Golden City: số liệu theo các nguồn công khai (CafeLand, trang giới thiệu dự
-- án) - Admin cần đối chiếu với tài liệu chính thức của chủ đầu tư. Vị trí các
-- phân khu trên sa bàn là MINH HOẠ TƯƠNG ĐỐI, chưa theo mặt bằng 1/500.

ALTER TABLE public.vh_project_geo ADD COLUMN IF NOT EXISTS masterplan jsonb;

DO $$
DECLARE
  pid text := 'p_vinpearl_danang';  -- "VINHOMES GOLDEN CITY"
  z_anhsao uuid; z_thienha uuid; z_mattroi uuid; z_binhminh uuid; z_mattrang uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.investment_projects WHERE id = pid) THEN
    RETURN;
  END IF;

  -- Địa điểm thật thay cho "TOÀN QUỐC".
  UPDATE public.investment_projects
     SET location = 'Dương Kinh & Kiến Thụy, Hải Phòng'
   WHERE id = pid AND coalesce(trim(location), '') IN ('', 'TOÀN QUỐC');

  -- 5 phân khu thay cho phân khu tạm "Toàn dự án" (chỉ khi chưa có mã căn nào gắn vào).
  IF NOT EXISTS (SELECT 1 FROM public.vh_zones WHERE project_id = pid AND name <> 'Toàn dự án') THEN
    DELETE FROM public.vh_zones z
     WHERE z.project_id = pid AND z.name = 'Toàn dự án'
       AND NOT EXISTS (SELECT 1 FROM public.vh_units u WHERE u.zone_id = z.id);
    INSERT INTO public.vh_zones (project_id, name, types, k_zone, sort_order) VALUES
      (pid, 'Ánh Sao',    ARRAY['shophouse', 'villa'], 1, 1),
      (pid, 'Thiên Hà',   ARRAY['shophouse', 'villa'], 1, 2),
      (pid, 'Mặt Trời',   ARRAY['shophouse', 'villa'], 1, 3),
      (pid, 'Bình Minh',  ARRAY['shophouse', 'villa'], 1, 4),
      (pid, 'Mặt Trăng',  ARRAY['shophouse', 'villa'], 1, 5);
  END IF;

  SELECT id INTO z_anhsao   FROM public.vh_zones WHERE project_id = pid AND name = 'Ánh Sao';
  SELECT id INTO z_thienha  FROM public.vh_zones WHERE project_id = pid AND name = 'Thiên Hà';
  SELECT id INTO z_mattroi  FROM public.vh_zones WHERE project_id = pid AND name = 'Mặt Trời';
  SELECT id INTO z_binhminh FROM public.vh_zones WHERE project_id = pid AND name = 'Bình Minh';
  SELECT id INTO z_mattrang FROM public.vh_zones WHERE project_id = pid AND name = 'Mặt Trăng';

  INSERT INTO public.vh_project_geo (project_id) VALUES (pid) ON CONFLICT (project_id) DO NOTHING;

  UPDATE public.vh_project_geo SET
    -- Toạ độ tương đối khu Hòa Nghĩa (Dương Kinh) - Đông Phương, Đại Đồng (Kiến Thụy).
    lat = coalesce(lat, 20.7760),
    lng = coalesce(lng, 106.6660),
    zoom = 14.5,
    area_ha = coalesce(area_ha, 240.6),
    units_text = coalesce(units_text, '~48.000 cư dân · 5 phân khu'),
    highlights = CASE WHEN highlights = '{}' THEN ARRAY[
      'Hơn 40 ha công viên và hồ điều hoà, 5 công viên chủ đề',
      'Phân khu Mặt Trăng khép kín (compound)',
      'Vinschool, Vinmec, Vincom Mega Mall trong khu đô thị',
      'Cửa ngõ phía Nam Hải Phòng, gần QL5B, ĐT353, ĐT363, cao tốc Hà Nội – Hải Phòng'
    ] ELSE highlights END,
    masterplan = coalesce(masterplan, jsonb_build_object(
      'image_url', null,
      'illustrative', true,
      'markers', jsonb_build_array(
        jsonb_build_object('id', 'lake', 'kind', 'lake', 'x', 50, 'y', 52, 'r', 13, 'label', 'Hồ điều hoà trung tâm'),
        jsonb_build_object('id', 'park1', 'kind', 'park', 'x', 31, 'y', 40, 'r', 7, 'label', 'Tropical Forest'),
        jsonb_build_object('id', 'park2', 'kind', 'park', 'x', 69, 'y', 40, 'r', 7, 'label', 'Art Forest'),
        jsonb_build_object('id', 'park3', 'kind', 'park', 'x', 50, 'y', 75, 'r', 7, 'label', 'Oriental Royal Park'),
        jsonb_build_object('id', 'road1', 'kind', 'road', 'x', 50, 'y', 4, 'label', 'Hướng QL5B · cao tốc Hà Nội – Hải Phòng'),
        jsonb_build_object('id', 'road2', 'kind', 'road', 'x', 96, 'y', 60, 'label', 'Đường 353 → Đồ Sơn'),
        jsonb_build_object('id', 'z1', 'kind', 'zone', 'x', 22, 'y', 22, 'r', 13, 'label', 'Ánh Sao', 'zone_id', z_anhsao),
        jsonb_build_object('id', 'z2', 'kind', 'zone', 'x', 50, 'y', 20, 'r', 12, 'label', 'Thiên Hà', 'zone_id', z_thienha),
        jsonb_build_object('id', 'z3', 'kind', 'zone', 'x', 78, 'y', 22, 'r', 13, 'label', 'Mặt Trời', 'zone_id', z_mattroi),
        jsonb_build_object('id', 'z4', 'kind', 'zone', 'x', 20, 'y', 70, 'r', 14, 'label', 'Bình Minh', 'zone_id', z_binhminh),
        jsonb_build_object('id', 'z5', 'kind', 'zone', 'x', 80, 'y', 72, 'r', 14, 'label', 'Mặt Trăng (khép kín)', 'zone_id', z_mattrang),
        jsonb_build_object('id', 'a1', 'kind', 'amenity', 'x', 38, 'y', 60, 'icon', 'school', 'label', 'Vinschool'),
        jsonb_build_object('id', 'a2', 'kind', 'amenity', 'x', 62, 'y', 61, 'icon', 'hospital', 'label', 'Vinmec'),
        jsonb_build_object('id', 'a3', 'kind', 'amenity', 'x', 50, 'y', 34, 'icon', 'mall', 'label', 'Vincom Mega Mall'),
        jsonb_build_object('id', 'a4', 'kind', 'amenity', 'x', 35, 'y', 88, 'icon', 'sport', 'label', 'Colorful Sportia')
      )
    ))
  WHERE project_id = pid;
END $$;
