-- Ảnh phối cảnh / flycam góc rộng (không phải ảnh 360° toàn cảnh 2:1):
-- khung 360° hiển thị ảnh ở đúng góc rộng hfov_deg thay vì kéo méo quanh
-- 360°, chỉ cho xoay trong phạm vi ảnh (xem flatPanoData / clampFlatPosition
-- trong src/lib/vinhomesMap.js).

ALTER TABLE public.vh_panoramas
  ADD COLUMN IF NOT EXISTS projection text NOT NULL DEFAULT 'equirect',
  ADD COLUMN IF NOT EXISTS hfov_deg numeric NOT NULL DEFAULT 120;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vh_panoramas_projection_check') THEN
    ALTER TABLE public.vh_panoramas ADD CONSTRAINT vh_panoramas_projection_check CHECK (projection IN ('equirect', 'flat'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vh_panoramas_hfov_check') THEN
    ALTER TABLE public.vh_panoramas ADD CONSTRAINT vh_panoramas_hfov_check CHECK (hfov_deg BETWEEN 30 AND 360);
  END IF;
END $$;

-- Ảnh phối cảnh tổng thể Vinhomes Hạ Long Xanh (Admin cung cấp, đã nằm sẵn
-- trong Storage của dự án - bucket doc-assets).
INSERT INTO public.vh_panoramas (project_id, title, mode, time_of_day, image_url, projection, hfov_deg, is_default, sort_order)
SELECT 'p_vinpearl_halong', 'Phối cảnh tổng thể', 'flycam', 'day',
       'https://eaugjhjhyeginnuayxik.supabase.co/storage/v1/object/public/doc-assets/letterheads/Gemini_Generated_Image_8ojqup8ojqup8ojq.jfif',
       'flat', 120,
       NOT EXISTS (SELECT 1 FROM public.vh_panoramas WHERE project_id = 'p_vinpearl_halong' AND is_default),
       0
WHERE EXISTS (SELECT 1 FROM public.investment_projects WHERE id = 'p_vinpearl_halong')
  AND NOT EXISTS (
    SELECT 1 FROM public.vh_panoramas
     WHERE project_id = 'p_vinpearl_halong'
       AND image_url = 'https://eaugjhjhyeginnuayxik.supabase.co/storage/v1/object/public/doc-assets/letterheads/Gemini_Generated_Image_8ojqup8ojqup8ojq.jfif'
  );
