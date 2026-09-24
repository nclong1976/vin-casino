-- Sửa lỗi upload ảnh/video CSKH luôn thất bại: bucket "chat-attachments"
-- (20260915110000_cskh_storage_bucket.sql) khai báo allowed_mime_types bằng
-- ký tự đại diện ("image/*", "video/*") - Supabase Storage của project này
-- KHÔNG khớp được dạng đại diện đó với mime type thật của file (vd
-- "image/webp", "image/jpeg"), nên MỌI lần upload ảnh/video bị từ chối ngay
-- từ storage-api (lỗi "mime type not supported"), 100% các lần thử từ lúc
-- tạo bucket tới giờ (xác nhận: storage.objects của bucket này rỗng hoàn
-- toàn - 0 file, dù messages.attachments có hàng chục dòng chứa ảnh).
--
-- UploadFile() (base44Client.js) bắt lỗi này và ÂM THẦM lùi về
-- FileReader.readAsDataURL() (nhúng thẳng base64 vào messages.attachments) -
-- đây chính là lý do người gửi vẫn thấy ảnh HIỆN BÌNH THƯỜNG trên máy họ
-- (base64 hiển thị được ngay, không cần tải lại từ đâu), nhưng phía nhận
-- (Admin, thiết bị khác) thì tin nhắn không tới được / rất nặng - đúng
-- nguyên nhân gốc mà migration cskh_storage_bucket.sql định giải quyết
-- (base64 ảnh làm phình bảng "messages", từng gây timeout - xem
-- fix_messages_timeout_and_index.sql) lại đang xảy ra hàng ngày.
--
-- Sửa bằng danh sách mime type TƯỜNG MINH thay vì ký tự đại diện - khớp
-- đúng những gì client thực sự gửi: compressImageFile() (imageCompression.js)
-- luôn ra image/webp hoặc image/jpeg; SVG/GIF (không nén) giữ nguyên type
-- gốc; video theo đúng các đuôi file MessagesTab.jsx/MessageBubble.jsx đã hỗ
-- trợ (fileType()); thêm HEIC/HEIF vì ảnh chụp thẳng từ camera iPhone (chưa
-- qua nén, nếu trình duyệt không hỗ trợ createImageBitmap) có thể giữ
-- nguyên định dạng gốc này.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
  'image/svg+xml', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/x-m4v', 'video/ogg', 'video/3gpp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]
where id = 'chat-attachments';
