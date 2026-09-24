-- Mở rộng Push Notification cho Admin (20260919090000_admin_push_notifications.sql)
-- thêm sự kiện thứ 4: hội viên MỚI ĐĂNG KÝ thành công. Đã hỏi bạn phạm vi mở
-- rộng "tất cả hoạt động người dùng" - CHỈ chọn đăng ký mới (KHÔNG bao gồm
-- đăng nhập/đặt cược Casino - tần suất quá cao, dễ khiến admin tắt hẳn thông
-- báo vì spam).
--
-- notify_admin_push_event() dùng lại NGUYÊN mẫu đã có (đọc secret qua Vault,
-- gọi net.http_post tới cùng 1 Edge Function admin-push-send) - chỉ thêm 1
-- nhánh mới theo TG_TABLE_NAME = 'users', không đổi hành vi 3 nhánh cũ.
CREATE OR REPLACE FUNCTION public.notify_admin_push_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  webhook_secret text;
  v_title text;
  v_body text;
  v_user_name text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'admin_push_webhook_secret'
  limit 1;

  if webhook_secret is null or webhook_secret = '' then
    return new;
  end if;

  if TG_TABLE_NAME = 'wallet_transactions' then
    select coalesce(nullif(full_name, ''), nullif(name, ''), nullif(email, ''), new.user_id)
      into v_user_name
      from public.users where id = new.user_id;
    v_title := case when new.type = 'withdraw' then 'Yêu cầu rút tiền mới' else 'Yêu cầu nạp tiền mới' end;
    v_body := coalesce(v_user_name, 'Khách hàng') || ' - ' || to_char(new.amount, 'FM999,999,999,999') || ' VNĐ';
  elsif TG_TABLE_NAME = 'transactions' then
    v_title := 'Hợp đồng đầu tư mới được ký';
    v_body := coalesce(nullif(new.user_name, ''), 'Khách hàng') || ' - ' ||
      coalesce(nullif(new.project_title, ''), nullif(new.project_name, ''), 'Dự án đầu tư');
  elsif TG_TABLE_NAME = 'messages' then
    select coalesce(nullif(full_name, ''), nullif(name, ''), nullif(email, ''), new.user_id)
      into v_user_name
      from public.users where id = new.user_id;
    v_title := 'Tin nhắn CSKH mới';
    v_body := coalesce(v_user_name, 'Khách hàng') || ': ' || coalesce(nullif(new.content, ''), '📎 Tệp đính kèm');
  elsif TG_TABLE_NAME = 'users' then
    v_title := 'Hội viên mới đăng ký';
    v_body := coalesce(nullif(new.full_name, ''), nullif(new.name, ''), 'Hội viên VinClub') || ' - ' ||
      coalesce(nullif(new.email, ''), nullif(new.phone, ''), new.id);
  else
    return new;
  end if;

  perform net.http_post(
    url := 'https://eaugjhjhyeginnuayxik.supabase.co/functions/v1/admin-push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', webhook_secret),
    body := jsonb_build_object('title', v_title, 'body', v_body, 'url', '/admin'),
    timeout_milliseconds := 10000
  );

  return new;
end;
$function$;

-- 4) Hội viên mới đăng ký - AFTER INSERT trên public.users. handle_new_user()
--    (trigger on_auth_user_created trên auth.users) tự INSERT vào bảng này
--    ngay sau khi đăng ký thành công - trigger dưới đây fires bất kể ai/hàm
--    nào thực hiện INSERT đó.
DROP TRIGGER IF EXISTS admin_push_new_user_registered ON public.users;
CREATE TRIGGER admin_push_new_user_registered
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_push_event();
