-- Chuông thông báo (NotificationBell.jsx) trước đây lưu trạng thái "đã đọc"
-- thuần ở localStorage RIÊNG TỪNG THIẾT BỊ (readKey = vinclub_read_broadcast_notifs_<userId>)
-- vì nhiều dòng notifications là BROADCAST dùng chung (user_id NULL hoặc
-- 'admin') - nếu ghi thẳng is_read lên dòng đó, 1 người bấm đọc sẽ tắt luôn
-- dấu "mới" cho MỌI người khác. Hệ quả: bấm "Đọc tất cả" ở thiết bị này,
-- đăng nhập lại ở thiết bị/trình duyệt khác vẫn thấy y hệt số thông báo
-- chưa đọc cũ - đúng lỗi được báo.
--
-- Bảng junction (user_id, notification_id) - mỗi người dùng tự có danh sách
-- đã đọc RIÊNG của mình dù dòng notifications gốc là broadcast dùng chung,
-- đồng bộ qua Postgres nên đăng nhập ở thiết bị nào cũng thấy đúng trạng
-- thái đã đọc thật.
CREATE TABLE public.notification_reads (
  user_id text NOT NULL,
  notification_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_reads_own
  ON public.notification_reads FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())::text AND NOT is_anon_session())
  WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_anon_session());
