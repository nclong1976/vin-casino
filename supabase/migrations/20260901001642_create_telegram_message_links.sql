-- Bảng ánh xạ 1 tin nhắn Telegram (đã forward từ khung chat CSKH trong app)
-- sang đúng hội thoại (conversation_id = user_id) của user đó - dùng để
-- Admin "Reply" trực tiếp trên Telegram mà tin trả lời được ghi ngược lại
-- đúng hội thoại, không cần mở Admin Panel. Chỉ service_role (server.ts)
-- đọc/ghi bảng này - không có policy RLS nào cho anon/authenticated.
--
-- Ghi chú: migration này áp dụng "apply_migration" trực tiếp lên Supabase ở
-- phiên làm việc trước (2026-09-01 ~00:16 UTC); file này được thêm lại vào
-- repo cho khớp với lịch sử migration thật trên server, tránh lệch giữa
-- local và remote.
CREATE TABLE public.telegram_message_links (
  telegram_message_id bigint PRIMARY KEY,
  conversation_id text NOT NULL,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_message_links_conversation ON public.telegram_message_links(conversation_id);
ALTER TABLE public.telegram_message_links ENABLE ROW LEVEL SECURITY;
