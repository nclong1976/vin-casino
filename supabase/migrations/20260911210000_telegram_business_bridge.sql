-- Cầu nối Telegram Business <-> CSKH: cho phép Admin dùng đúng "Sửa tin
-- nhắn"/"Xóa tin nhắn"/"Xóa hàng loạt" NGUYÊN BẢN của Telegram (long-press ->
-- Edit/Delete), thay vì phải build nút bấm giả lập - vì Telegram Bot API chỉ
-- báo được sự kiện sửa/xóa thật (edited_business_message/
-- deleted_business_messages) cho các cuộc trò chuyện đi qua 1 "Business
-- Connection" thật (Cài đặt Telegram > Telegram Business > Chatbots), KHÔNG
-- có cách nào làm được việc này với mô hình "1 nhóm chung + Forum Topic"
-- đang dùng (đã xác nhận qua tài liệu Bot API - deleted_business_messages
-- chỉ tồn tại trong phạm vi Business Connection).
--
-- 3 bảng, server-only (server.ts dùng service_role key, không qua RLS):
--
-- 1) telegram_business_connection: 1 dòng duy nhất (id='default') lưu
--    business_connection_id ĐANG SỐNG - Telegram gửi update
--    "business_connection" mỗi khi Admin bật/tắt/đổi quyền cho bot, cần lưu
--    lại để biết dùng connection nào khi gửi tin (sendMessage/sendPhoto yêu
--    cầu đúng tham số business_connection_id).
--
-- 2) telegram_business_links: ánh xạ 1-1 telegram_user_id (ID Telegram CỐ
--    ĐỊNH của 1 người, giống nhau dù họ nhắn cho bot hay cho tài khoản
--    Business) -> user_id (tài khoản VinClub thật) - có được qua bước liên
--    kết an toàn 1 lần (khách bấm link "t.me/<bot>?start=<user_id>" TỪ
--    TRONG APP đang đăng nhập, xem handleBusinessLinkStart() trong
--    server.ts) - không cần khách tự gõ số điện thoại/email (dễ gõ nhầm/giả
--    mạo người khác trên 1 nền tảng tài chính).
--
-- 3) telegram_business_message_links: ánh xạ 1 tin nhắn Telegram thật
--    (telegram_message_id + business_connection_id, vì message_id chỉ duy
--    nhất TRONG PHẠM VI 1 chat) -> đúng 1 dòng trong public.messages - cần
--    để edited_business_message/deleted_business_messages biết chính xác
--    dòng nào cần UPDATE/DELETE khi Admin sửa/xóa thật trên Telegram.

CREATE TABLE public.telegram_business_connection (
  id text PRIMARY KEY DEFAULT 'default',
  business_connection_id text,
  business_user_id bigint,
  is_enabled boolean NOT NULL DEFAULT false,
  can_reply boolean NOT NULL DEFAULT false,
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.telegram_business_links (
  telegram_user_id bigint PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_business_links_user_id ON public.telegram_business_links(user_id);

CREATE TABLE public.telegram_business_message_links (
  telegram_message_id bigint NOT NULL,
  business_connection_id text NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_message_id, business_connection_id)
);
CREATE INDEX idx_telegram_business_message_links_message_id ON public.telegram_business_message_links(message_id);

-- RLS: chỉ Admin đọc/ghi được (server.ts dùng service_role nên tự bỏ qua
-- RLS, không cần policy riêng cho service_role) - đúng convention đã dùng
-- cho telegram_message_links/telegram_wallet_links (ALL + is_admin_user()).
ALTER TABLE public.telegram_business_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_business_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_business_message_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_business_connection_admin_only
  ON public.telegram_business_connection FOR ALL
  USING (is_admin_user());

CREATE POLICY telegram_business_links_admin_only
  ON public.telegram_business_links FOR ALL
  USING (is_admin_user());

CREATE POLICY telegram_business_message_links_admin_only
  ON public.telegram_business_message_links FOR ALL
  USING (is_admin_user());
