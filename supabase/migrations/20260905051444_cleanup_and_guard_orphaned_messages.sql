-- Phát hiện qua báo cáo "admin không nhận được tin nhắn của người dùng":
-- MessagesTab.jsx nhóm tin nhắn theo
-- `cid = m.conversation_id || m.user_id || m.sender || "unknown"` - 22 dòng
-- rác trong bảng messages có CẢ conversation_id LẪN user_id đều NULL và
-- content rỗng (không rõ nguồn gốc từ đường code hiện tại nào - có thể từ 1
-- phiên bản cũ hơn của Support.jsx/ChatInput.jsx đã được sửa từ trước) nên
-- bị gộp chung thành 1 "hội thoại" giả `cid = "user"` (đúng khớp field
-- sender của cả 22 dòng) - hiện ra thành thẻ "Khách #user" với nội dung
-- rỗng/"—" trong danh sách hội thoại CSKH của admin, trộn lẫn tin của NHIỀU
-- người dùng khác nhau (nếu có) vào 1 hội thoại vô danh không xác định
-- được ai đã gửi - với admin, đây đúng nghĩa "không nhận được" tin nhắn vì
-- không đọc được nội dung lẫn không biết trả lời cho ai.
--
-- Xoá sạch 22 dòng rác này (xác nhận qua đối chiếu: TOÀN BỘ dòng có
-- conversation_id NULL trong bảng đều rỗng nội dung, không có dòng thật
-- nào bị ảnh hưởng).
delete from public.messages where conversation_id is null;

-- Chặn tái diễn ở tầng dữ liệu (không phụ thuộc sửa đúng client code nào
-- đã gây ra 22 dòng trên, vì không xác định được đường tạo ra chúng trong
-- code hiện tại) - conversation_id là field DUY NHẤT mọi nơi (MessagesTab.jsx,
-- Support.jsx) dùng để nhóm/lọc tin nhắn theo đúng người dùng, không có
-- trường hợp hợp lệ nào để nó là NULL (kể cả tin admin gửi tự động, vd "Ví
-- đã được nạp tiền", vẫn luôn set conversation_id = user_id người nhận).
-- content rỗng vẫn hợp lệ (tin chỉ đính kèm ảnh/tệp) nên KHÔNG ràng buộc field đó.
alter table public.messages
  alter column conversation_id set not null;
