-- Mỗi khách hàng (support_conversations.id = conversation_id = user_id) có
-- tối đa 1 Telegram Forum Topic riêng - lưu message_thread_id trả về từ
-- Telegram Bot API createForumTopic() để mọi tin nhắn tiếp theo của khách đó
-- gửi đúng vào topic của họ (không đan xen với khách khác trong cùng nhóm).
-- NULL nghĩa là chưa từng tạo topic (khách mới, hoặc nhóm Telegram chưa bật
-- Forum Topics - server.ts tự lùi về gửi không kèm thread khi tạo topic thất
-- bại, không chặn luồng forward CSKH hiện có).
alter table public.support_conversations
  add column telegram_thread_id bigint;

create index idx_support_conversations_telegram_thread
  on public.support_conversations (telegram_thread_id)
  where telegram_thread_id is not null;
