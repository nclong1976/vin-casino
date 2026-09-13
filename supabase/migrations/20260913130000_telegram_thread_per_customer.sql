-- Trước đây mỗi conversation_id (session CSKH) có 1 Forum Topic Telegram
-- RIÊNG (support_conversations.telegram_thread_id) - từ khi có
-- cskh_rotating_conversation_id.sql, 1 khách hàng có THỂ có NHIỀU
-- conversation_id theo thời gian (bắt đầu lại sau khi rời trang >= 10 phút),
-- nên lịch sử trò chuyện của 1 khách bị RẢI RÁC ra nhiều Topic khác nhau
-- trên Telegram - Admin không xem được liền mạch lịch sử 1 khách ở 1 chỗ.
--
-- Bảng này tách "Topic Telegram của AI" khỏi "Topic của phiên chat nào" -
-- khóa theo user_id (ổn định suốt đời) thay vì conversation_id (đổi mỗi
-- phiên) - nên mọi tin nhắn của CÙNG 1 khách, dù thuộc bao nhiêu
-- conversation_id khác nhau, đều gom về ĐÚNG 1 Topic duy nhất trên Telegram.
create table if not exists public.telegram_customer_threads (
  user_id text primary key,
  telegram_thread_id bigint not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_telegram_customer_threads_thread_id
  on public.telegram_customer_threads (telegram_thread_id);

alter table public.telegram_customer_threads enable row level security;

-- Chỉ server (service_role, dùng supabaseAdmin trong server.ts) đọc/ghi bảng
-- này - không có policy nào cho anon/authenticated, giống các bảng nội bộ
-- Telegram khác (telegram_message_links, telegram_wallet_links...).
