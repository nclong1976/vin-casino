-- Vá lỗi thật đã xảy ra: 1 tin nhắn khách hàng bị forward NHIỀU LẦN sang
-- nhóm Telegram CSKH (xác nhận qua telegram_message_links - cùng 1
-- message_id có 2-3 dòng link, có cặp cách nhau chỉ 12ms). Nguyên nhân:
-- net.http_post() (pg_net) không đảm bảo đúng-1-lần cho Edge Function
-- telegram-cskh-outbound - có thể phát lại request khi phản hồi chậm, và
-- Postgres trigger firing đúng-1-lần/dòng không giúp gì nếu tầng gọi HTTP
-- phía sau lại gọi lặp. Phía nhận (Edge Function) phải tự đảm bảo idempotent
-- thay vì tin tưởng "chỉ được gọi đúng 1 lần".
--
-- Bảng "nhận vé" (claim) - INSERT ... ON CONFLICT DO NOTHING RETURNING là
-- thao tác nguyên tử (atomic): 2 lượt gọi trùng nhau cho CÙNG 1 message_id +
-- target chỉ 1 lượt "thắng" (được INSERT thật, có RETURNING), lượt còn lại
-- luôn thấy đã tồn tại (không RETURNING gì) - khác với cách "SELECT kiểm tra
-- trước rồi mới gửi" (có khoảng hở đua nhau giữa 2 lượt gọi cách nhau vài
-- mili-giây như đã xảy ra trong thực tế).
CREATE TABLE IF NOT EXISTS public.telegram_outbound_forward_claims (
  message_id text NOT NULL,
  target text NOT NULL CHECK (target IN ('group', 'business')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, target)
);
ALTER TABLE public.telegram_outbound_forward_claims ENABLE ROW LEVEL SECURITY;
-- Chỉ Edge Function (service role, bỏ qua RLS) đọc/ghi bảng này - không có
-- policy cho "authenticated"/"anon" vì đây là dữ liệu vận hành nội bộ, không
-- phải nội dung chat của khách hàng.
