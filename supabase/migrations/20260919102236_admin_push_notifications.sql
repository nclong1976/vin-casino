-- Thông báo đẩy (Web Push) cho quản trị viên - nhận được ngay cả khi KHÔNG
-- mở ứng dụng (đóng hẳn trình duyệt/tab), khác với báo động âm thanh + đổi
-- tiêu đề tab đã có ở Admin.jsx (chỉ hoạt động khi tab admin đang mở sẵn).
-- Dùng đúng mẫu Database Webhook (pg_net + Supabase Vault cho secret xác
-- thực) đã áp dụng cho cầu nối Telegram trước đây (xem
-- 20260914140000_telegram_cskh_database_webhook.sql, dù cầu nối đó đã gỡ) -
-- Edge Function đứng sau (supabase/functions/admin-push-send) tự gửi Web
-- Push thật tới mọi thiết bị admin đã đăng ký qua thư viện web-push (VAPID).

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Danh sách thiết bị admin đã bật thông báo đẩy - mỗi dòng là 1
-- PushSubscription trình duyệt cấp (endpoint duy nhất theo thiết bị/trình
-- duyệt). Chỉ admin mới đọc/ghi được (dữ liệu vận hành nội bộ).
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  endpoint text PRIMARY KEY,
  p256dh text NOT NULL,
  auth text NOT NULL,
  admin_user_id text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_push_subscriptions_admin_all ON public.admin_push_subscriptions;
CREATE POLICY admin_push_subscriptions_admin_all
  ON public.admin_push_subscriptions FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Trigger dùng chung cho cả 3 nguồn sự kiện (wallet_transactions,
-- transactions, messages) - phân biệt bằng TG_TABLE_NAME, cùng mẫu
-- notify_telegram_cskh_outbound() trước đây. Secret xác thực đọc qua
-- Supabase Vault (KHÔNG hardcode vào migration) - giá trị thật đã được nạp
-- trực tiếp qua Supabase MCP bằng
-- select vault.create_secret('...', 'admin_push_webhook_secret'), PHẢI
-- khớp đúng biến ADMIN_PUSH_WEBHOOK_SECRET cấu hình trong Edge Function
-- Secrets (Project Settings → Edge Functions).
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

-- 1) Yêu cầu Nạp/Rút mới (status mặc định 'pending' lúc khách tạo).
DROP TRIGGER IF EXISTS admin_push_wallet_pending ON public.wallet_transactions;
CREATE TRIGGER admin_push_wallet_pending
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_admin_push_event();

-- 2) Hợp đồng đầu tư mới được ký - signature_content chuyển từ rỗng/NULL
--    sang có giá trị (ký lúc tạo giao dịch MỚI hoặc ký bổ sung sau qua
--    Contract.jsx, xem 2 nhánh INSERT/UPDATE riêng bên dưới).
DROP TRIGGER IF EXISTS admin_push_contract_signed_insert ON public.transactions;
CREATE TRIGGER admin_push_contract_signed_insert
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.signature_content IS NOT NULL AND NEW.signature_content <> '')
  EXECUTE FUNCTION public.notify_admin_push_event();

DROP TRIGGER IF EXISTS admin_push_contract_signed_update ON public.transactions;
CREATE TRIGGER admin_push_contract_signed_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (
    NEW.signature_content IS NOT NULL AND NEW.signature_content <> '' AND
    (OLD.signature_content IS NULL OR OLD.signature_content = '')
  )
  EXECUTE FUNCTION public.notify_admin_push_event();

-- 3) Tin nhắn CSKH mới từ khách hàng (sender='user') - admin.tự đọc lại
--    bằng khung chat CSKH, thông báo đẩy chỉ để BIẾT NGAY dù không mở app.
DROP TRIGGER IF EXISTS admin_push_new_message ON public.messages;
CREATE TRIGGER admin_push_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.sender = 'user')
  EXECUTE FUNCTION public.notify_admin_push_event();
