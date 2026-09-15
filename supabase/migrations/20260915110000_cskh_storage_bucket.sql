-- Kho lưu file thật cho ảnh/tệp đính kèm CSKH (thay cho cách cũ: mã hoá
-- base64 rồi nhét thẳng vào cột messages.attachments trên Postgres) - đây
-- là nguyên nhân chính khiến gửi/tải ảnh CSKH chậm: base64 nặng hơn ~37%
-- so với file gốc, không được trình duyệt cache như ảnh thật, và bị kéo về
-- kèm MỌI lượt tải danh sách tin nhắn dù chỉ đang xem tin nhắn chữ. Chuyển
-- sang Supabase Storage: tin nhắn chỉ còn lưu 1 URL ngắn, ảnh thật nằm
-- riêng, trình duyệt tự tải/cache như ảnh bình thường.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  true,
  15728640, -- 15MB - rộng rãi hơn trần nén ảnh phía client (~700KB) để vẫn
            -- nhận được video/tệp đính kèm khác không qua nén.
  array['image/*', 'video/*', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain']
)
on conflict (id) do nothing;

-- Cho phép NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP (khách hàng lẫn admin - cả 2 phía đều tự
-- upload ảnh CSKH) tải file LÊN bucket này. Đọc file xuống dùng thẳng URL
-- public (bucket public=true, endpoint /object/public/... không qua RLS)
-- nên không cần policy SELECT riêng ở đây.
create policy "chat_attachments_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-attachments');
