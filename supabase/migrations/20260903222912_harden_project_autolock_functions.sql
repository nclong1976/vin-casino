-- Vá 2 cảnh báo advisor phát sinh từ migration trước
-- (20260903230000_auto_lock_investment_30min_after_open.sql), cùng loại đã
-- gặp và vá ở 20260903180000_harden_rpc_execute_grants.sql:
-- 1. set_project_opened_at(): thiếu SET search_path cố định (mutable search_path).
-- 2. lock_expired_project_investments(): REVOKE ALL FROM PUBLIC không đủ vì
--    Supabase tự GRANT EXECUTE trực tiếp cho anon/authenticated qua ALTER
--    DEFAULT PRIVILEGES khi tạo hàm mới - phải REVOKE tường minh từng role.

CREATE OR REPLACE FUNCTION public.set_project_opened_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if NEW.is_active is true and (TG_OP = 'INSERT' or OLD.is_active is distinct from true) then
    NEW.opened_at := now();
  elsif NEW.is_active is not true then
    NEW.opened_at := null;
  end if;
  return NEW;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.lock_expired_project_investments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_expired_project_investments() FROM authenticated;
