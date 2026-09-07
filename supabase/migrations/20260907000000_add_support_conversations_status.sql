-- Bổ sung khái niệm "trạng thái xử lý" + "nhân viên nhận xử lý" cho hội
-- thoại CSKH (Support.jsx / MessagesTab.jsx). Trước đây hội thoại chỉ được
-- suy ra từ bảng "messages" (nhóm theo conversation_id), không có nơi nào
-- lưu trạng thái (đang mở/chờ phản hồi/đã đóng) hay admin nào đang xử lý -
-- nhiều admin cùng mở 1 hội thoại dễ trả lời trùng nhau.
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
  assigned_admin_id text REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_admin_name text,
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
-- DEFINER (cùng mẫu is_admin()/process_withdrawal... đã dùng trong hệ
-- thống) để hàm này có đủ quyền UPDATE support_conversations bất kể RLS
-- của người gọi (khách hàng) - phạm vi hẹp, CHỈ tự động chuyển closed ->
-- open, không cho phép khách chạm vào bất kỳ cột nào khác (assigned_admin_*
-- giữ nguyên).
CREATE OR REPLACE FUNCTION public.reopen_support_conversation_on_customer_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sender = 'user' and new.conversation_id is not null then
    update public.support_conversations
    set status = 'open'
    where id = new.conversation_id and status = 'closed';
  end if;
  return new;
end;
$function$;

CREATE TRIGGER trg_reopen_support_conversation_on_customer_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION reopen_support_conversation_on_customer_message();

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
