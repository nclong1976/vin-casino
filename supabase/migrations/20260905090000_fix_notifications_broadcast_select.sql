-- Phát hiện qua báo cáo "sửa kết nối thông báo từ admin đến người dùng":
-- NotificationsTab.jsx (admin) gửi thông báo "Toàn bộ Ứng dụng" bằng cách
-- tạo 1 dòng public.notifications với user_id = NULL (xem comment trong
-- chính file đó: "NotificationBell.jsx CHỈ hiển thị các dòng Notification
-- có user_id NULL (broadcast toàn hệ thống) hoặc đúng chuỗi 'admin'").
--
-- Nhưng policy SELECT hiện tại chỉ cho phép đọc dòng có
-- `user_id = auth.uid()::text` HOẶC `is_admin_user()` - với user_id NULL,
-- vế đầu luôn là NULL (không phải true), nên với MỌI người dùng thường
-- (không phải admin), CẢ 2 vế đều false -> Postgres RLS chặn hoàn toàn,
-- SELECT trả về 0 dòng. Kết quả: admin bấm "Phát hành thông báo" thành
-- công (ghi INSERT vẫn qua được vì admin thoả is_admin_user()), nhưng
-- KHÔNG một người dùng thường nào đọc lại được dòng đó - chuông thông báo
-- luôn trống với broadcast toàn hệ thống dù dữ liệu đã có sẵn trên server.
-- Đã tái hiện trực tiếp trên dữ liệu thật (tạo/xoá 1 dòng test) bằng
-- set_config('request.jwt.claims', ...) + set local role authenticated -
-- xác nhận SELECT trả về 0 dòng trước khi sửa.
--
-- Thông báo nhắm riêng "Ban Quản Trị" (user_id = 'admin') và thông báo cá
-- nhân thật (user_id = uid của chính người đó) KHÔNG bị ảnh hưởng - vẫn
-- đọc đúng qua is_admin_user()/so khớp uid như cũ. Chỉ thêm đúng 1 điều
-- kiện còn thiếu: cho phép user_id IS NULL (broadcast công khai) được đọc
-- bởi bất kỳ ai đã đăng nhập - không đổi INSERT/UPDATE/DELETE (người dùng
-- thường vẫn không tự sửa/xoá được dòng broadcast, đúng thiết kế hiện có:
-- trạng thái "đã đọc" của từng người được theo dõi cục bộ trong
-- localStorage, không ghi lên dòng DB - xem NotificationBell.jsx).
drop policy if exists notifications_select_own_or_admin on public.notifications;

create policy notifications_select_own_or_admin
  on public.notifications
  for select
  to authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())::text
    or is_admin_user()
  );
