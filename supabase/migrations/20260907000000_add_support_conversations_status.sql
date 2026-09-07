-- Bổ sung khái niệm "trạng thái xử lý" + "nhân viên nhận xử lý" cho hội
-- thoại CSKH (Support.jsx / MessagesTab.jsx). Trước đây hội thoại chỉ được
-- suy ra từ bảng "messages" (nhóm theo conversation_id), không có nơi nào
-- lưu trạng thái (đang mở/chờ phản hồi/đã đóng) hay admin nào đang xử lý -
-- nhiều admin cùng mở 1 hội thoại dễ trả lời trùng nhau.
--
-- LƯU Ý: file này đã được viết lại tại chỗ trước khi apply lần đầu (migration
-- gốc CHƯA từng chạy lên bất kỳ database nào - xác nhận qua list_migrations()
-- không có version "20260907000000") - không phải sửa 1 migration đã áp
-- dụng thật. Bản gốc thiếu: (1) hoàn toàn chưa được apply lên production dù
-- code client (Support.jsx/MessagesTab.jsx) đã merge và phụ thuộc thẳng vào
-- bảng này; (2) trigger reopen tin thẳng vào messages.conversation_id không
-- đối chiếu với messages.user_id - 1 user đã đăng nhập có thể gửi tin với
-- user_id của chính mình (qua được RLS messages_insert_own_or_admin, policy
-- đó chỉ kiểm tra user_id) nhưng conversation_id trỏ tới người khác, khiến
-- trigger mở lại nhầm hội thoại đã đóng của người khác. Bản này vá cả 2, và
-- gộp thêm vài cột cần cho bước điều phối ticket (routing engine) kế tiếp để
-- không phải chạy thêm 1 migration ALTER TABLE riêng ngay sau.
--
-- 1 dòng = 1 hội thoại = 1 khách hàng (id = user_id, khớp đúng với
-- messages.conversation_id hiện tại là user.id). Không có dòng cho 1 khách
-- hàng nghĩa là hội thoại đó coi như đang ở trạng thái mặc định "open",
-- chưa ai nhận xử lý - phía client tự suy ra mặc định này, không cần tạo
-- sẵn hàng loạt dòng rỗng cho toàn bộ user hiện có.
-- created_date (không phải created_at) để khớp đúng tên cột mà
-- LocalEntityClient.create() (base44Client.js) luôn tự gắn cho MỌI entity -
-- xem shapeRowForTable()/ENTITY_COLUMNS trong supabaseDb.js: field nào
-- không khớp cột thật sẽ bị gom vào "extra" jsonb thay vì làm hỏng câu lệnh
-- upsert, nên vẫn thêm cột "extra" dự phòng như messages/notifications.
CREATE TABLE public.support_conversations (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_admin_id text REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_admin_name text,
  -- last_message_at/last_message_preview/unread_count_admin: giữ sẵn trên
  -- chính dòng hội thoại (do trigger bên dưới tự cập nhật mỗi khi có tin
  -- nhắn mới) để Agent Workspace sắp xếp/hiện badge hàng đợi mà không cần
  -- join/group-by bảng "messages" (có thể hàng chục nghìn dòng) mỗi lần tải
  -- danh sách hội thoại.
  last_message_at timestamptz,
  last_message_preview text,
  unread_count_admin integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

-- Khách hàng chỉ đọc được đúng trạng thái hội thoại CỦA MÌNH (để hiện badge
-- + biết hội thoại đang đóng hay không); Admin đọc được tất cả.
CREATE POLICY support_conversations_select_own_or_admin
  ON public.support_conversations FOR SELECT
  USING ((((auth.uid())::text = id) OR is_admin()));

-- Chỉ Admin mới được tạo/sửa/xóa dòng trạng thái - khách hàng không tự đổi
-- được trạng thái/người phụ trách hội thoại của chính mình (tránh khách tự
-- ý đánh dấu "đã đóng" hoặc giả mạo đã có admin nhận xử lý).
CREATE POLICY support_conversations_write_admin_only
  ON public.support_conversations FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TRIGGER support_conversations_set_updated_at
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Khách hàng không có quyền UPDATE trực tiếp support_conversations (policy
-- write_admin_only ở trên) - nhưng khi 1 khách hàng gửi tin nhắn MỚI vào
-- đúng lúc hội thoại của họ đang "closed" (admin đã đóng trước đó), hội
-- thoại cần tự mở lại "open" ngay, không được để khách bị kẹt không ai
-- thấy tin nhắn mới của mình chỉ vì hội thoại cũ đã đóng. Dùng SECURITY
-- DEFINER (cùng mẫu is_admin()/process_wallet_transaction... đã dùng trong
-- hệ thống) để hàm này có đủ quyền UPDATE support_conversations bất kể RLS
-- của người gọi (khách hàng).
--
-- Nhân tiện gộp luôn việc cập nhật last_message_at/last_message_preview/
-- unread_count_admin cho MỌI tin nhắn (không chỉ lúc reopen) - tránh phải
-- thêm 1 trigger AFTER INSERT thứ 2 trên "messages" chỉ để làm việc gần như
-- giống hệt.
--
-- BẢO MẬT: chỉ tác động khi new.conversation_id = new.user_id (đúng khách
-- hàng chủ hội thoại đó tự gửi, khớp quy ước Support.jsx luôn set cả 2 field
-- này bằng user.id) - policy messages_insert_own_or_admin hiện có CHỈ kiểm
-- tra user_id = auth.uid(), KHÔNG kiểm tra conversation_id, nên 1 user có
-- thể chèn tin với conversation_id giả mạo trỏ tới người khác; điều kiện
-- này chặn đúng trường hợp đó khỏi ảnh hưởng tới support_conversations của
-- người khác (tin nhắn giả mạo đó vẫn insert được vào "messages" như trước
-- - đây là giới hạn có sẵn của chính bảng "messages", không thuộc phạm vi
-- vá của migration này - chỉ đảm bảo nó không lan sang bảng mới này).
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
        unread_count_admin = unread_count_admin + 1
    where id = new.conversation_id;

    if not found then
      insert into public.support_conversations (id, status, last_message_at, last_message_preview, unread_count_admin)
      values (new.conversation_id, 'open', new.created_date, left(coalesce(new.content, '[Tệp đính kèm]'), 120), 1);
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

CREATE TRIGGER trg_sync_support_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION reopen_support_conversation_on_customer_message();

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
