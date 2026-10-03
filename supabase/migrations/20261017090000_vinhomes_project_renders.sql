-- Ảnh phối cảnh tổng thể (Admin cung cấp) cho 4 dự án Vinhomes, hiển thị
-- trong khung 360° ở mục "Định giá thử" dạng ảnh phối cảnh góc rộng
-- (projection = 'flat'). File nằm trong public/vinhomes/360/ của app, phục
-- vụ cùng tên miền nên trình duyệt đọc được vào WebGL (không vướng CORS).

INSERT INTO public.vh_panoramas (project_id, title, mode, time_of_day, image_url, projection, hfov_deg, is_default, sort_order)
SELECT v.project_id, 'Phối cảnh tổng thể', 'flycam', 'day', v.url, 'flat', v.hfov,
       NOT EXISTS (SELECT 1 FROM public.vh_panoramas d WHERE d.project_id = v.project_id AND d.is_default),
       0
FROM (VALUES
  ('p_land_central_park',      '/vinhomes/360/central-park.webp',      110),
  ('p_land_riverside_harmony', '/vinhomes/360/global-gate.webp',       110),
  ('p_vinpearl_danang',        '/vinhomes/360/golden-city.webp',       110),
  ('id_s6stwlxdq',             '/vinhomes/360/imperia-hai-phong.webp', 110)
) AS v(project_id, url, hfov)
WHERE EXISTS (SELECT 1 FROM public.investment_projects p WHERE p.id = v.project_id)
  AND NOT EXISTS (SELECT 1 FROM public.vh_panoramas x WHERE x.project_id = v.project_id AND x.image_url = v.url);
