-- Thêm trạng thái vòng đời tin nhắn CSKH: Delivered/Read thay cho boolean
-- is_read cũ (chỉ 1 chiều, chỉ dùng nội bộ MessagesTab.jsx để đếm badge
-- "chưa đọc" phía Admin). delivered_at/read_at cho phép cả 2 chiều
-- (khách hàng lẫn admin) đều thấy tick trạng thái tin mình gửi đi đã tới
-- thiết bị đối phương / đã được xem hay chưa - is_read cũ không đủ vì chỉ
-- ADMIN từng ghi giá trị này (Support.jsx/MessageBubble.jsx phía khách
-- hàng trước giờ không đọc/ghi is_read ở đâu cả).
--
-- RLS hiện có (messages_update_own_or_admin: auth.uid()::text = user_id OR
-- is_admin()) đã đủ cho cả 2 chiều set delivered_at/read_at mà không cần
-- policy mới - vì cột user_id luôn là id của khách hàng bất kể ai gửi tin
-- (sender='user' hay 'admin'), nên chính khách hàng (đọc tin của admin)
-- và admin (đọc tin của khách) đều tự update được đúng dòng thuộc hội
-- thoại của mình.
alter table public.messages
  add column delivered_at timestamptz,
  add column read_at timestamptz;

-- Giữ lại thông tin "đã đọc" cũ (is_read chỉ set true khi Admin mở hội
-- thoại, xem MessagesTab.jsx openConversation()) bằng cách coi thời điểm
-- backfill là "đã đọc từ trước tới giờ" - không có dữ liệu chính xác hơn
-- (is_read không lưu kèm thời điểm đọc thật), dùng created_date của chính
-- tin nhắn làm mốc an toàn (chắc chắn không sau thời điểm thật đã đọc).
update public.messages set read_at = created_date where is_read = true;

-- Không còn nơi nào khác đọc/ghi is_read ngoài MessagesTab.jsx (đã grep
-- xác nhận toàn repo) - xoá sạch, không cần lớp tương thích ngược.
alter table public.messages drop column is_read;

-- Phục vụ fetchMessagesPage() (cursor pagination thật theo hội thoại,
-- src/lib/supabaseDb.js) - WHERE conversation_id = ... ORDER BY
-- created_date DESC LIMIT ... trước giờ chỉ có index rời trên từng cột
-- (idx_messages_conversation, không kèm created_date).
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_date desc);
