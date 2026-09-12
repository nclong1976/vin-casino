-- "Hệ thống tự động khóa đầu tư sau 30 phút kể từ khi mở đầu tư" - áp dụng
-- cho MỌI dự án ở MỌI hạng mục (Dự Án, VinHomes, Đầu tư nghỉ dưỡng, Đầu tư
-- chứng khoán), không riêng dự án dùng scheduled_open_at/scheduled_close_at.
--
-- Cơ chế:
-- 1. Cột opened_at ghi lại thời điểm is_active CHUYỂN sang true gần nhất
--    (qua trigger, tự động - không cần sửa client). Set lại null khi
--    is_active tắt, để lần mở kế tiếp tính lại từ đầu.
-- 2. Cron job (cùng mẫu với 'settle-matured-investments' đã có) mỗi phút rà
--    soát và tắt is_active cho dự án nào opened_at đã quá 30 phút.
--
-- Không hồi tố cho các dự án ĐANG active từ trước khi có cột này
-- (opened_at NULL với dữ liệu cũ) - tránh khóa đột ngột các dự án đang chạy
-- bình thường ngay sau khi deploy; chỉ áp dụng cho lần mở/tắt kế tiếp trở đi.

ALTER TABLE public.investment_projects
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

COMMENT ON COLUMN public.investment_projects.opened_at IS 'Thời điểm is_active chuyển sang true gần nhất (do trigger set_project_opened_at tự ghi). NULL nếu đang tắt hoặc chưa từng qua trigger này. Dùng để tự động khóa (is_active=false) sau đúng 30 phút.';

CREATE OR REPLACE FUNCTION public.set_project_opened_at()
 RETURNS trigger
 LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_set_project_opened_at ON public.investment_projects;
CREATE TRIGGER trg_set_project_opened_at
  BEFORE INSERT OR UPDATE ON public.investment_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_opened_at();

CREATE OR REPLACE FUNCTION public.lock_expired_project_investments()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  update public.investment_projects
    set is_active = false
    where is_active = true
      and opened_at is not null
      and opened_at <= now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

REVOKE ALL ON FUNCTION public.lock_expired_project_investments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_expired_project_investments() TO service_role;

SELECT cron.schedule('lock-expired-project-investments', '* * * * *', 'select public.lock_expired_project_investments();');
