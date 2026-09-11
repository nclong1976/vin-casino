-- Chế độ bảo trì TOÀN BỘ trang chủ (khác với casino_maintenance_config -
-- bảng đó chỉ chặn riêng 12 phòng game, không chặn nạp/rút/hồ sơ/dự
-- án...). Theo yêu cầu: khi admin bật, TOÀN BỘ các mục trong trang chủ
-- của người dùng thường đều không vào được (hiện màn hình bảo trì thay
-- vì nội dung thật), admin không bị ảnh hưởng.
--
-- Dùng lại đúng mẫu kiến trúc đã có ở casino_maintenance_config: 1 dòng
-- duy nhất (id cố định 'default'), config dạng jsonb, RLS cho phép mọi
-- user đã đăng nhập ĐỌC (để thấy màn hình bảo trì) nhưng chỉ Admin mới
-- GHI được, và đăng ký vào supabase_realtime để user đang mở app bị
-- chặn ngay khi admin bật công tắc mà không cần tải lại trang.
CREATE TABLE public.app_maintenance_config (
  id text PRIMARY KEY DEFAULT 'default',
  config jsonb NOT NULL DEFAULT '{"enabled": false, "message": "Hệ thống đang trong thời gian bảo trì. Vui lòng quay lại sau."}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_maintenance_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_maintenance_config_select_authenticated
  ON public.app_maintenance_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY app_maintenance_config_write_admin_only
  ON public.app_maintenance_config FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_maintenance_config;

INSERT INTO public.app_maintenance_config (id, config)
VALUES ('default', '{"enabled": false, "message": "Hệ thống đang trong thời gian bảo trì. Vui lòng quay lại sau."}'::jsonb)
ON CONFLICT (id) DO NOTHING;
