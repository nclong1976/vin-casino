-- (1) is_admin_user() (dùng trong RLS của nhiều bảng: bank_accounts,
-- casino_rounds, lucky_wheel_spins, messen, notifications, savings_goals,
-- signatures, telegram_*, transactions, users, wallet_transactions...) chỉ
-- kiểm tra role = 'admin', trong khi is_admin() (dùng trong hầu hết RPC
-- quản trị: process_wallet_transaction, set_user_balance_absolute...) kiểm
-- tra rộng hơn: role IN ('admin','ADMIN') HOẶC email thuộc 2 owner bootstrap
-- cứng. Hai định nghĩa lệch nhau nghĩa là 1 admin hợp lệ theo is_admin()
-- (vd owner đăng nhập bằng email bootstrap nhưng cột role chưa phải đúng
-- chữ thường 'admin') có thể gọi được RPC quản trị nhưng lại bị RLS chặn
-- khi đọc thẳng các bảng trên - không rò rỉ dữ liệu cho ai khác, nhưng gây
-- từ chối nhầm cho đúng admin. Sửa bằng cách cho is_admin_user() gọi thẳng
-- is_admin() - giữ nguyên tên/chữ ký hàm (để mọi policy đang tham chiếu nó
-- không cần sửa) nhưng từ nay chỉ có 1 nguồn định nghĩa admin duy nhất.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
SELECT public.is_admin();
$function$;

-- (2) reopen_support_conversation_on_customer_message(): nhánh "user" đã có
-- "if not found then insert" để tự tạo dòng support_conversations khi khách
-- hàng nhắn tin lần đầu, nhưng nhánh "admin" (vd tin từ chối nạp/rút gửi
-- trước khi khách từng chat) chỉ UPDATE - nếu đó là tin nhắn ĐẦU TIÊN của
-- hội thoại đó thì UPDATE không khớp dòng nào (chưa tồn tại), hội thoại sẽ
-- không hiện trong danh sách CSKH cho tới khi khách tự nhắn tin. Thêm đúng
-- 1 nhánh "if not found then insert" tương ứng, y hệt nhánh user (trừ
-- unread_count_admin = 0 vì admin là người vừa gửi, không có gì "chưa đọc"
-- cho admin, và không set topic vì chỉ khách hàng chọn chip chủ đề).
CREATE OR REPLACE FUNCTION public.reopen_support_conversation_on_customer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

if not found then
insert into public.support_conversations (id, status, last_message_at, last_message_preview, unread_count_admin)
values (new.conversation_id, 'open', new.created_date, left(coalesce(new.content, '[Tệp đính kèm]'), 120), 0);
end if;
end if;
return new;
end;
$function$;
