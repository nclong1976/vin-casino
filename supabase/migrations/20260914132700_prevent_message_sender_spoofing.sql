-- LỖ HỔNG PHÁT HIỆN qua test tự động 2 luồng khách<->admin (giả lập RLS
-- thật bằng SET ROLE authenticated + request.jwt.claims, không bypass qua
-- service_role): policy messages_insert_own_or_admin chỉ kiểm tra user_id
-- khớp chủ sở hữu, KHÔNG kiểm tra cột sender - một khách hàng bất kỳ có thể
-- tự INSERT 1 dòng messages với sender='admin' ngay trong CHÍNH hội thoại
-- của mình (vì user_id vẫn là của chính họ), khiến MessageBubble.jsx hiển
-- thị y như tin thật từ "Admin CSKH" - rủi ro giả mạo thông báo (vd "đã
-- duyệt rút tiền thành công") để lừa đảo người khác bằng ảnh chụp màn hình.
-- Tương tự, policy UPDATE cũ cũng cho phép khách tự sửa content/sender của
-- BẤT KỲ tin nào trong hội thoại của mình (kể cả tin admin gửi) - cần thiết
-- để khách tự ghi read_at/delivered_at (xem messageLifecycle.js), nhưng lại
-- vô tình cho phép sửa luôn cả nội dung/người gửi.

-- 1) INSERT: bắt buộc sender='user' khi người ghi KHÔNG phải admin - đúng
-- hành vi thật của UI (Support.jsx resendMessage() luôn hardcode sender:
-- "user"), không phá vỡ luồng hợp lệ nào.
DROP POLICY IF EXISTS messages_insert_own_or_admin ON public.messages;
CREATE POLICY messages_insert_own_or_admin
  ON public.messages FOR INSERT
  WITH CHECK ((((auth.uid())::text = user_id) AND (sender = 'user')) OR is_admin());

-- 2) UPDATE: chỉ admin mới sửa được sender/content/attachments/conversation_id/
-- user_id - non-admin UPDATE (vd đánh dấu delivered_at/read_at) vẫn đi qua
-- bình thường nhưng các cột "định danh" tự động bị ép về giá trị cũ, cùng
-- mẫu protect_transaction_financial_fields() đã dùng cho bảng transactions.
CREATE OR REPLACE FUNCTION public.protect_message_identity_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    new.sender := old.sender;
    new.content := old.content;
    new.attachments := old.attachments;
    new.conversation_id := old.conversation_id;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS protect_message_identity_fields_trigger ON public.messages;
CREATE TRIGGER protect_message_identity_fields_trigger
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_identity_fields();
