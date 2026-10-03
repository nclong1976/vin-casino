-- Vinhomes "Bản đồ 360°" - Giai đoạn 2: toạ độ dự án, ảnh 360° và điểm
-- tương tác (hotspot) trên ảnh. Ảnh lưu ở Storage bucket "vh-panoramas"
-- (đọc công khai, chỉ Admin tải lên / xoá).

CREATE TABLE IF NOT EXISTS public.vh_project_geo (
  project_id text PRIMARY KEY REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  lat double precision CHECK (lat BETWEEN -90 AND 90),
  lng double precision CHECK (lng BETWEEN -180 AND 180),
  zoom numeric NOT NULL DEFAULT 15 CHECK (zoom BETWEEN 3 AND 20),
  -- Toạ độ đã được Admin xác nhận đúng vị trí thật chưa.
  verified boolean NOT NULL DEFAULT false,
  area_ha numeric,
  units_text text,
  highlights text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vh_panoramas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.investment_projects(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.vh_zones(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'flycam' CHECK (mode IN ('flycam', 'ground')),
  time_of_day text NOT NULL DEFAULT 'day' CHECK (time_of_day IN ('day', 'night')),
  image_url text NOT NULL,
  preview_url text,
  storage_path text,
  -- Góc (độ) từ tâm ảnh tới hướng Bắc thật, để la bàn chỉ đúng.
  north_offset_deg numeric NOT NULL DEFAULT 0 CHECK (north_offset_deg >= -360 AND north_offset_deg <= 360),
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vh_panoramas_project_idx ON public.vh_panoramas(project_id, sort_order);
-- Mỗi dự án tối đa 1 ảnh mặc định.
CREATE UNIQUE INDEX IF NOT EXISTS vh_panoramas_one_default ON public.vh_panoramas(project_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.vh_hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pano_id uuid NOT NULL REFERENCES public.vh_panoramas(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('zone', 'amenity', 'link')),
  yaw double precision NOT NULL,      -- radian
  pitch double precision NOT NULL CHECK (pitch BETWEEN -1.5708 AND 1.5708),
  label text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'pin',
  zone_id uuid REFERENCES public.vh_zones(id) ON DELETE SET NULL,
  target_pano_id uuid REFERENCES public.vh_panoramas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'link' OR target_pano_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS vh_hotspots_pano_idx ON public.vh_hotspots(pano_id);

ALTER TABLE public.vh_project_geo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_panoramas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vh_hotspots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vh_project_geo', 'vh_panoramas', 'vh_hotspots'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_admin') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin', t);
    END IF;
  END LOOP;
END $$;

-- ───────────── Storage ─────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vh-panoramas', 'vh-panoramas', true, 26214400, ARRAY['image/jpeg', 'image/webp', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'vh_panoramas_admin_insert') THEN
    CREATE POLICY vh_panoramas_admin_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'vh-panoramas' AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'vh_panoramas_admin_update') THEN
    CREATE POLICY vh_panoramas_admin_update ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'vh-panoramas' AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'vh_panoramas_admin_delete') THEN
    CREATE POLICY vh_panoramas_admin_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'vh-panoramas' AND public.is_admin());
  END IF;
END $$;

-- ───────────── Toạ độ khởi tạo (TẠM - Admin cần xác nhận) ─────────────
-- Toạ độ tương đối theo địa chỉ công khai của dự án; verified = false để
-- màn Admin nhắc kiểm tra lại. Golden City chưa có địa điểm trong dữ liệu
-- nên để trống - không hiện trên bản đồ cho tới khi Admin nhập.

INSERT INTO public.vh_project_geo (project_id, lat, lng, zoom)
SELECT p.id, v.lat, v.lng, v.zoom
FROM (VALUES
  ('p_land_central_park', 10.7945::float8, 106.7215::float8, 16),
  ('p_land_riverside_harmony', 21.1150, 105.8660, 15),
  ('id_s6stwlxdq', 20.8660, 106.6560, 16),
  ('p_vinpearl_halong', 20.9500, 106.9300, 14)
) AS v(project_id, lat, lng, zoom)
JOIN public.investment_projects p ON p.id = v.project_id
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.vh_project_geo (project_id)
SELECT p.id FROM public.investment_projects p
WHERE trim(p.category) = 'VinHomes'
ON CONFLICT (project_id) DO NOTHING;
