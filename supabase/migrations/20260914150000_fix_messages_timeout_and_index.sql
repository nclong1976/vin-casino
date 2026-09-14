-- Vá lỗi "admin không gửi được tin nhắn hình ảnh": điều tra qua
-- mcp__Supabase__query_logs xác nhận nguyên nhân thật là Postgres huỷ câu
-- lệnh vì statement_timeout (8s của role "authenticated") khi đọc/ghi bảng
-- "messages" - bảng này đã phình lên 38MB dù chỉ ~355 dòng vì vài tin nhắn
-- (đa phần admin gửi ảnh chụp màn hình) có cột "attachments" base64 nặng
-- tới 1-5MB/dòng (compressImageFile phía client không có trần dung lượng
-- sau nén - đã vá riêng trong src/lib/imageCompression.js). Mọi lượt liệt
-- kê tin nhắn (fetchFromSupabase() trong base44Client.js, không lọc theo
-- hội thoại) phải giải nén TOÀN BỘ các dòng nặng này mỗi lần - dưới tải dồn
-- dập (nhiều tab admin/khách cùng poll) đủ để vượt 8s và làm cả các request
-- khác (kể cả chính request gửi ảnh của admin) bị lỗi 500.
--
-- 1) Bảng "messages" trước đây KHÔNG có index nào trên cột "created_date"
-- (cột thật dùng để sắp xếp/lọc - xem ENTITY_COLUMNS.Message trong
-- supabaseDb.js) - các index sẵn có chỉ trên "created_at"/"thread_id" (cột
-- của 1 tính năng khác hoàn toàn không liên quan, xem ghi chú
-- READ_PROJECTED_ENTITIES). Thêm index đúng cột thật đang dùng.
CREATE INDEX IF NOT EXISTS idx_messages_created_date ON public.messages (created_date DESC);

-- 2) Nới statement_timeout cho role "authenticated" (8s -> 20s) - biện pháp
-- tạm thời trong lúc các dòng dữ liệu nặng cũ (đã có từ trước, gắn với
-- lịch sử chat CSKH thật của người dùng nên KHÔNG tự ý xoá) còn tồn tại,
-- tránh việc 1 truy vấn hợp lệ (không phải do lỗi) vẫn bị huỷ giữa chừng.
-- KHÔNG đổi role "anon" (giữ 3s - vai trò này không cần chạy truy vấn nặng).
ALTER ROLE authenticated SET statement_timeout = '20s';
