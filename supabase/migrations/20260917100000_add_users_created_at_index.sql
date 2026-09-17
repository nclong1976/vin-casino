-- Hỗ trợ phân trang thật (keyset) cho public.users - listSupabaseUsersPage()
-- (src/lib/supabaseDb.js) lọc ORDER BY created_at DESC + WHERE created_at <
-- cursor. Bảng public.users trước đây CHƯA có index nào trên created_at
-- (chỉ auth.users có idx_users_created_at_desc - bảng auth riêng, không phải
-- bảng public.users mà toàn bộ app đang đọc) - thiếu index này khiến mỗi
-- trang phải quét/sort toàn bảng thay vì 1 index seek, đúng kiểu chi phí
-- tăng dần theo số hội viên mà việc thêm phân trang ở đây muốn tránh.
create index if not exists idx_users_created_at on public.users (created_at desc);
