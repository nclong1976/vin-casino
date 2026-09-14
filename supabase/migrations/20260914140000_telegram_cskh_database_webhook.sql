-- Cầu nối CSKH <-> Telegram (chiều "trong app -> Telegram", gồm cả nhóm CSKH
-- lẫn Telegram Business) chuyển từ Realtime listener chạy trên server.ts
-- (phụ thuộc Render còn thức hay không) sang Database Webhook gọi thẳng 1
-- Supabase Edge Function (supabase/functions/telegram-cskh-outbound) - hạ
-- tầng này thuộc Supabase, không còn phụ thuộc Render.
--
-- pg_net cho phép Postgres tự gọi HTTP bất đồng bộ (không chặn transaction
-- gốc) ngay trong trigger.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Secret dùng để Edge Function tự xác minh request thật từ trigger này (Edge
-- Function tắt verify_jwt vì đây không phải request có JWT Supabase) - đọc
-- qua Supabase Vault (supabase_vault extension, đã có sẵn trong project),
-- KHÔNG hardcode giá trị thật vào migration (tránh lộ secret vào git). Giá
-- trị thật được nạp 1 lần bằng
-- select vault.create_secret('...', 'telegram_webhook_secret') (đã chạy
-- trực tiếp qua Supabase MCP, không nằm trong file này) và PHẢI khớp đúng
-- biến TELEGRAM_WEBHOOK_SECRET cấu hình trong Edge Function Secrets.
-- (ALTER DATABASE ... SET app.* đã thử trước nhưng bị Postgres managed của
-- Supabase từ chối - "permission denied to set parameter" - nên dùng Vault
-- thay vì current_setting().)
CREATE OR REPLACE FUNCTION public.notify_telegram_cskh_outbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  payload jsonb;
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'telegram_webhook_secret'
  limit 1;

  if webhook_secret is null or webhook_secret = '' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  if TG_OP = 'DELETE' then
    payload := jsonb_build_object('type', 'DELETE', 'record', null, 'old_record', to_jsonb(old));
  elsif TG_OP = 'UPDATE' then
    payload := jsonb_build_object('type', 'UPDATE', 'record', to_jsonb(new), 'old_record', to_jsonb(old));
  else
    payload := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new), 'old_record', null);
  end if;

  perform net.http_post(
    url := 'https://eaugjhjhyeginnuayxik.supabase.co/functions/v1/telegram-cskh-outbound',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', webhook_secret),
    body := payload,
    timeout_milliseconds := 10000
  );

  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$function$;

-- INSERT: không lọc theo sender ở đây - Edge Function tự quyết định forward
-- vào nhóm CSKH (sender='user') và/hoặc đồng bộ sang Telegram Business
-- (sender='admin'), đúng logic 2 nhánh đã có trong startTelegramForwarding()
-- cũ.
DROP TRIGGER IF EXISTS telegram_cskh_outbound_insert ON public.messages;
CREATE TRIGGER telegram_cskh_outbound_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_cskh_outbound();

-- UPDATE: chỉ quan tâm admin THẬT SỰ sửa nội dung (content đổi) - bỏ qua các
-- UPDATE chỉ đổi read_at/delivered_at (đánh dấu đã đọc/đã tới, xảy ra rất
-- thường xuyên, không liên quan gì tới đồng bộ Telegram Business).
DROP TRIGGER IF EXISTS telegram_cskh_outbound_update ON public.messages;
CREATE TRIGGER telegram_cskh_outbound_update
  AFTER UPDATE ON public.messages
  FOR EACH ROW
  WHEN (NEW.sender = 'admin' AND NEW.conversation_id IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content)
  EXECUTE FUNCTION public.notify_telegram_cskh_outbound();

DROP TRIGGER IF EXISTS telegram_cskh_outbound_delete ON public.messages;
CREATE TRIGGER telegram_cskh_outbound_delete
  AFTER DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_telegram_cskh_outbound();
