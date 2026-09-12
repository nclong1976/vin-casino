-- "threads"/"thread_members": 0 dòng dữ liệu và không có bất kỳ đoạn code
-- nào trong src/ hay server.ts đọc/ghi 2 bảng này (đã grep xác nhận) - là
-- schema tồn đọng từ một tính năng chat theo luồng (thread) chưa từng được
-- hoàn thiện. CASCADE để dọn theo 2 policy "threads read"/"threads update"
-- trên bảng threads (tham chiếu tới thread_members) - không ảnh hưởng gì
-- khác vì không nơi nào dùng tới.
DROP TABLE IF EXISTS public.thread_members CASCADE;
DROP TABLE IF EXISTS public.threads CASCADE;
