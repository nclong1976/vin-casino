-- Cho phép 1 khách hàng có NHIỀU support_conversations theo thời gian ("bắt
-- đầu cuộc trò chuyện mới" ở phía khách sau khi rời trang CSKH >= 10 phút -
-- xem src/lib/cskhConversation.js) thay vì đúng 1 conversation_id = user.id
-- suốt đời như trước đây. Không xóa/đụng dữ liệu tin nhắn cũ - Admin vẫn tra
-- cứu được mọi hội thoại cũ qua Panel như bình thường.
--
-- Trước đây toàn hệ thống ngầm giả định conversation_id LUÔN bằng user.id:
-- RLS support_conversations check "auth.uid()::text = id", và trigger dưới
-- đây chỉ nhận tin của khách khi "conversation_id = user_id". Vì RLS của
-- bảng messages (bảng chứa nội dung chat thật) lại dựa vào cột user_id
-- RIÊNG (auth.uid()::text = user_id, độc lập conversation_id), nên chỉ cần
-- thêm đúng 1 cột user_id vào support_conversations để tách "hội thoại nào"
-- khỏi "hội thoại của ai" - không cần đổi gì ở bảng messages.

alter table public.support_conversations
  add column if not exists user_id text;

-- Backfill dữ liệu cũ: mọi dòng hiện có đều đang dùng đúng quy ước id=user.id.
update public.support_conversations
  set user_id = id
  where user_id is null;

-- RLS: khách xem được hội thoại của MÌNH qua user_id (không còn qua id) -
-- giữ luôn nhánh "= id" cho các dòng backfill/edge-case cũ (vô hại, id vẫn
-- luôn = user_id với dữ liệu cũ) để không có khoảng trống truy cập nào giữa
-- 2 bước migrate.
drop policy if exists support_conversations_select_own_or_admin on public.support_conversations;
create policy support_conversations_select_own_or_admin
  on public.support_conversations
  for select
  using ((auth.uid())::text = user_id or (auth.uid())::text = id or public.is_admin());

-- Trigger: bỏ điều kiện bắt buộc "conversation_id = user_id" (chặn hoàn
-- toàn hội thoại MỚI với id khác user_id) - ghi user_id tường minh từ
-- new.user_id thay vì ngầm định trùng id.
CREATE OR REPLACE FUNCTION public.reopen_support_conversation_on_customer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
if new.sender = 'user' and new.conversation_id is not null and new.user_id is not null then
update public.support_conversations
set status = 'open',
last_message_at = new.created_date,
last_message_preview = left(coalesce(new.content, '[Tệp đính kèm]'), 120),
unread_count_admin = unread_count_admin + 1,
topic = coalesce(new.topic, topic)
where id = new.conversation_id;

if not found then
insert into public.support_conversations (id, user_id, status, last_message_at, last_message_preview, unread_count_admin, topic)
values (new.conversation_id, new.user_id, 'open', new.created_date, left(coalesce(new.content, '[Tệp đính kèm]'), 120), 1, new.topic);
end if;
elsif new.sender = 'admin' and new.conversation_id is not null then
update public.support_conversations
set last_message_at = new.created_date,
last_message_preview = left(coalesce(new.content, '[Tệp đính kèm]'), 120),
unread_count_admin = 0
where id = new.conversation_id;

if not found then
insert into public.support_conversations (id, user_id, status, last_message_at, last_message_preview, unread_count_admin)
values (new.conversation_id, new.user_id, 'open', new.created_date, left(coalesce(new.content, '[Tệp đính kèm]'), 120), 0);
end if;
end if;
return new;
end;
$function$;
