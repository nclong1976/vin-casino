-- Hội viên mới đăng ký: chuông thông báo phải trống hoàn toàn, chỉ có DUY NHẤT
-- 1 thông báo chào mừng. Phía client (NotificationBell.jsx) đã ẩn mọi tin
-- broadcast tạo TRƯỚC thời điểm tài khoản được tạo; trigger dưới đây tạo tin
-- chào mừng riêng cho tài khoản (user_id = id hội viên).
--
-- Gắn AFTER INSERT trên public.users - handle_new_user() (trigger
-- on_auth_user_created trên auth.users) INSERT vào bảng này ngay khi đăng ký
-- thành công. id cố định theo user nên ON CONFLICT DO NOTHING giữ đúng 1 tin.
CREATE OR REPLACE FUNCTION public.create_welcome_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications (id, user_id, title, content, type, is_read, created_date)
  values (
    'n_welcome_' || new.id,
    new.id,
    'Chào mừng bạn đã trở thành thành viên của VinClub',
    'Chào mừng bạn đã trở thành thành viên của VinClub',
    'admin',
    false,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_welcome_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS welcome_notification_on_signup ON public.users;
CREATE TRIGGER welcome_notification_on_signup
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_welcome_notification();
