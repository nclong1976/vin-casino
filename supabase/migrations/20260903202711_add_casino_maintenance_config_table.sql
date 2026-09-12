-- Thay thế localStorage + Firebase RTDB (vinclub_casino_config_v1) làm nơi
-- lưu trạng thái bảo trì/hiển thị của casino - trước đây admin bật bảo trì
-- trên 1 thiết bị chỉ lan sang thiết bị khác qua RTDB; giờ Postgres là
-- nguồn thật duy nhất, đọc/ghi qua Supabase Realtime thay RTDB.
--
-- CHỈ 1 dòng duy nhất (id cố định 'default') - không cần nhiều dòng vì đây
-- là cấu hình toàn cục cho cả app, không theo user/game riêng lẻ (per-game
-- vẫn nằm trong cột config jsonb, giống cấu trúc cũ ở localStorage).
CREATE TABLE public.casino_maintenance_config (
  id text PRIMARY KEY DEFAULT 'default',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casino_maintenance_config ENABLE ROW LEVEL SECURITY;

-- Người chơi ĐÃ đăng nhập cần đọc được để thấy banner bảo trì/tỷ lệ hiển
-- thị; chỉ Admin mới được sửa.
CREATE POLICY casino_maintenance_config_select_authenticated
  ON public.casino_maintenance_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY casino_maintenance_config_write_admin_only
  ON public.casino_maintenance_config FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.casino_maintenance_config;
