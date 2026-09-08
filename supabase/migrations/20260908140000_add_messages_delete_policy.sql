-- Bảng "messages" có 3 policy (select/insert/update) nhưng THIẾU policy
-- DELETE. RLS mặc định TỪ CHỐI mọi lệnh không có policy khớp - khi Admin
-- bấm "Xóa tin nhắn" (MessagesTab.jsx, base44.entities.Message.delete()),
-- lệnh DELETE bị Postgres âm thầm lọc bỏ (0 dòng bị xóa, KHÔNG phải lỗi),
-- nên client (không kiểm tra rowcount, chỉ kiểm tra "error") coi đó là
-- thành công - tin nhắn tưởng đã xóa nhưng vẫn còn nguyên trong database.
--
-- Xác nhận bằng test trực tiếp trên production với `set local role
-- authenticated` (đúng cách kiểm RLS thật, khác với set_config("role", ...)
-- vốn KHÔNG đổi role kết nối) kèm JWT admin thật: trước migration này, lệnh
-- DELETE của admin chạy xong nhưng dòng vẫn còn nguyên.
--
-- Chỉ Admin được xóa (is_admin()) - khớp đúng thiết kế hiện có: chỉ
-- MessagesTab.jsx (giao diện Admin) có nút xóa, Support.jsx (giao diện
-- khách hàng) không có nút này - khách hàng không tự xóa được tin nhắn của
-- chính mình (đã xác nhận qua test: user tự xóa bị RLS từ chối).
CREATE POLICY messages_delete_admin_only
  ON public.messages FOR DELETE
  USING (is_admin());
