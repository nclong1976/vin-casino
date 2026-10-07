-- Thông báo đẩy "Tin nhắn CSKH mới" mở thẳng khung chat của đúng khách
-- (/admin?chat=<user_id>, xem Admin.jsx + public/sw.js) thay vì chỉ mở /admin
-- rồi admin phải tự tìm khách. Nội dung tin dài được cắt gọn cho vừa màn hình
-- khoá điện thoại. Các nhánh khác giữ nguyên.
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
  v_url text := '/admin';
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
    v_body := coalesce(v_user_name, 'Khách hàng') || ': ' ||
      coalesce(nullif(left(new.content, 160), ''), '📎 Tệp đính kèm') ||
      case when length(new.content) > 160 then '…' else '' end;
    v_url := '/admin?chat=' || new.user_id;
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
    body := jsonb_build_object('title', v_title, 'body', v_body, 'url', v_url),
    timeout_milliseconds := 10000
  );

  return new;
end;
$function$;
