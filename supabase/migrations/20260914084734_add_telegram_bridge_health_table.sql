-- "Sức khoẻ" 2 kênh forward Telegram (CSKH + Nạp/Rút) - cùng mẫu kiến trúc
-- đã dùng ở app_maintenance_config: 1 dòng duy nhất (id cố định 'default'),
-- trạng thái dạng jsonb, đăng ký vào supabase_realtime để Admin Panel thấy
-- ngay khi trạng thái đổi mà không cần tải lại trang.
--
-- Mục đích: trước đây admin chỉ biết cầu nối Telegram bị gián đoạn (Render
-- ngủ, token/key hết hạn...) qua việc khách hàng phàn nàn tin nhắn/giao dịch
-- không tới nơi. server.ts (recordTelegramHealth()) sẽ cập nhật bảng này mỗi
-- lần gửi Telegram thành công/thất bại, cho mỗi kênh 'cskh'/'wallet'.
--
-- Chỉ Admin đọc được (dữ liệu vận hành nội bộ, không phải dữ liệu khách
-- hàng) - is_admin() đã có sẵn từ trước. server.ts dùng service role key nên
-- ghi trực tiếp, bỏ qua RLS - không cần policy ghi cho client.
CREATE TABLE public.telegram_bridge_health (
  id text PRIMARY KEY DEFAULT 'default',
  status jsonb NOT NULL DEFAULT '{
    "cskh": {"last_success_at": null, "last_error": null, "last_error_at": null},
    "wallet": {"last_success_at": null, "last_error": null, "last_error_at": null}
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_bridge_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_bridge_health_select_admin_only
  ON public.telegram_bridge_health FOR SELECT
  TO authenticated
  USING (is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_bridge_health;

INSERT INTO public.telegram_bridge_health (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
