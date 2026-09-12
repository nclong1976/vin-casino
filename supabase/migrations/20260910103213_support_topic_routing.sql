-- Điều hướng theo chủ đề (Auto-routing) cho CSKH: khách chọn 1 chip chủ đề
-- (QUICK_TOPICS trong ChatInput.jsx) trước khi gửi, admin lọc/thấy badge chủ
-- đề trên danh sách hội thoại. Khách hàng KHÔNG được tự ghi trực tiếp vào
-- support_conversations (policy support_conversations_write_admin_only, ALL,
-- is_admin() only) - nên topic chỉ ghi được gián tiếp qua trigger
-- SECURITY DEFINER reopen_support_conversation_on_customer_message() đã có
-- sẵn (đúng pattern "tự mở lại hội thoại khi khách nhắn tin" đang dùng),
-- KHÔNG cần policy RLS mới nào.
alter table public.messages
  add column topic text;

alter table public.support_conversations
  add column topic text;

-- Thêm đúng 1 thay đổi: coalesce(new.topic, topic) - chỉ cập nhật topic của
-- hội thoại khi tin nhắn này CÓ mang topic mới (khách vừa bấm chip), còn lại
-- giữ nguyên topic cũ (topic "dính" từ lần chọn gần nhất, không bị xoá bởi
-- những tin nhắn tiếp theo không kèm topic). Mọi logic khác giữ y hệt bản
-- gốc - không đổi hành vi status/last_message_preview/unread_count_admin.
create or replace function public.reopen_support_conversation_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.sender = 'user' and new.conversation_id is not null and new.conversation_id = new.user_id then
    update public.support_conversations
    set status = 'open',
        last_message_at = new.created_date,
        last_message_preview = left(coalesce(new.content, '[Tệp đính kèm]'), 120),
        unread_count_admin = unread_count_admin + 1,
        topic = coalesce(new.topic, topic)
    where id = new.conversation_id;

    if not found then
      insert into public.support_conversations (id, status, last_message_at, last_message_preview, unread_count_admin, topic)
      values (new.conversation_id, 'open', new.created_date, left(coalesce(new.content, '[Tệp đính kèm]'), 120), 1, new.topic);
    end if;
  elsif new.sender = 'admin' and new.conversation_id is not null then
    update public.support_conversations
    set last_message_at = new.created_date,
        last_message_preview = left(coalesce(new.content, '[Tệp đính kèm]'), 120),
        unread_count_admin = 0
    where id = new.conversation_id;
  end if;
  return new;
end;
$function$;
