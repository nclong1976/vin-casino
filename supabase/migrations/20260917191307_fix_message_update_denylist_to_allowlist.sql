-- BUG (RLS + trigger): messages_update_own_or_admin cho phép khách hàng
-- UPDATE bất kỳ dòng messages nào có user_id = chính họ - và vì mọi tin
-- nhắn trong 1 hội thoại CSKH (kể cả tin ADMIN gửi) đều mang user_id =
-- id của khách hàng sở hữu hội thoại đó (xem reopen_support_conversation_
-- on_customer_message: nhánh sender='admin' vẫn dùng new.user_id để tìm/
-- tạo đúng hội thoại của khách), nên khách hàng có quyền UPDATE lên cả
-- tin nhắn do ADMIN gửi trong hội thoại của chính mình.
--
-- protect_message_identity_fields_trigger (từ migration
-- prevent_message_sender_spoofing) chỉ khoá lại 5 field: sender, content,
-- attachments, conversation_id, user_id - đây là kiểu "deny-list". Mọi
-- field KHÁC của bảng messages - kể cả những field nhạy cảm đã có từ
-- trước hoặc thêm sau đó (ai_summary, ai_summary_created_at, extra, topic,
-- text, body, images, created_date/created_at, thread_id, sender_id) -
-- không được liệt kê nên KHÔNG bị khoá, tức khách hàng gọi thẳng
-- PATCH /rest/v1/messages?id=eq.<id của 1 tin ADMIN gửi> vẫn sửa được,
-- ví dụ:
--   - ai_summary/ai_summary_created_at: tự ghi đè bản tóm tắt AI dùng để
--     admin triage hội thoại - có thể dùng để đánh lừa admin đọc sai nội
--     dung tin nhắn thật.
--   - created_date/created_at: tự sửa lại mốc thời gian đã gửi tin (kể cả
--     tin admin) - ảnh hưởng tới tranh chấp "đã báo CSKH lúc nào".
--   - text/body/images/extra/topic: các field dữ liệu khác của tin nhắn.
-- Đây KHÔNG phải lỗi lý thuyết: RLS đã CHO PHÉP UPDATE dòng (USING đúng),
-- trigger chỉ chặn được 5/19 cột, nên PostgREST áp NEW của client cho mọi
-- cột còn lại.
--
-- FIX: đổi protect_message_identity_fields() từ "deny-list" (liệt kê từng
-- cột phải khoá - dễ quên khi thêm cột mới, thực tế đã quên ai_summary*/
-- extra/topic/created_date) sang "allow-list" (new := old rồi chỉ mở lại
-- đúng 2 cột khách hàng CẦN được tự sửa trên tin nhắn trong hội thoại của
-- mình: read_at/delivered_at - dùng cho báo đã nhận/đã đọc ở 2 chiều
-- khách<->admin). Cách này tự động khoá luôn mọi cột sẽ thêm sau này mà
-- không cần nhớ sửa lại function - đúng gốc rễ khiến deny-list cũ bị sót.
--
-- Không đổi RLS policy nào (USING/WITH CHECK giữ nguyên) - chỉ đổi trigger,
-- nên không ảnh hưởng luồng Realtime hiện có.
CREATE OR REPLACE FUNCTION public.protect_message_identity_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_read_at timestamptz;
  v_delivered_at timestamptz;
begin
  if not public.is_admin() then
    v_read_at := new.read_at;
    v_delivered_at := new.delivered_at;
    new := old;
    new.read_at := v_read_at;
    new.delivered_at := v_delivered_at;
  end if;
  return new;
end;
$function$;
