-- Cấu hình chạy của các Edge Function ký văn bản đọc từ Supabase Vault, để
-- không phải đặt trùng ESIGN_INTERNAL_SECRET / APP_PUBLIC_URL ở phần secret
-- của Edge Function (vẫn ưu tiên secret Edge Function nếu có - xem
-- supabase/functions/_shared/esign/http.ts runtimeConfig()).
--
-- Vault cần có (tạo bằng SQL, không đưa giá trị vào git):
--   select vault.create_secret('<chuỗi ngẫu nhiên>', 'esign_internal_secret');
--   select vault.create_secret('https://<tên miền app>', 'esign_app_public_url');
-- esign_internal_secret dùng chung với pg_cron (esign_kick_campaigns,
-- esign_kick_pdf_jobs).

CREATE OR REPLACE FUNCTION public.esign_runtime_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'internal_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'esign_internal_secret' limit 1),
    'app_public_url', (select decrypted_secret from vault.decrypted_secrets where name = 'esign_app_public_url' limit 1)
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_runtime_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_runtime_config() TO service_role;
