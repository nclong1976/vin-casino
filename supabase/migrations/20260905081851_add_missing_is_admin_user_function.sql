-- Phát hiện khi CI "Supabase Preview" (replay toàn bộ migrations trên
-- database RỖNG hoàn toàn mới) thất bại ngay ở migration kế tiếp
-- (fix_notifications_broadcast_select) với lỗi:
--   "function is_admin_user() does not exist (SQLSTATE 42883)"
--
-- Xác nhận: is_admin_user() ĐÃ tồn tại thật trên production (dùng trong rất
-- nhiều policy "_own_or_admin" ở nhiều bảng - bank_accounts, casino_rounds,
-- lucky_wheel_spins, messen, notifications, savings_goals, signatures,
-- telegram_*, transactions, users, wallet_transactions...) nhưng CHƯA từng
-- được ghi vào bất kỳ file migration nào trong repo (grep toàn bộ thư mục
-- supabase/migrations không thấy dòng nào định nghĩa nó) - tức nó được tạo
-- trực tiếp trên production ở một thời điểm nào đó trước session này mà
-- không có file migration tương ứng đi kèm, khiến việc replay lại toàn bộ
-- lịch sử migration từ database rỗng KHÔNG tái tạo đúng được trạng thái
-- thật của production.
--
-- Đây chỉ bổ sung ĐÚNG hàm còn thiếu (lấy nguyên văn từ
-- pg_get_functiondef() trên production, áp lại là no-op vì đã tồn tại y
-- hệt) để migration kế tiếp (dùng is_admin_user() trong policy mới) có thể
-- replay được từ đầu. KHÔNG tái tạo lại toàn bộ các policy "_own_or_admin"
-- khác đang thiếu tương tự ở nhiều bảng - đó là một khoảng lệch lịch sử
-- migration lớn hơn, nằm ngoài phạm vi của lần sửa lỗi thông báo admin lần
-- này, cần một migration riêng nếu muốn khắc phục triệt để.
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())::text
      AND role = 'admin'
  );
$function$;
