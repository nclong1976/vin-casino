-- Ngày giờ đầu tư/ký hợp đồng (transactions.created_date) trước đây được
-- tin tưởng từ CLIENT: trigger compute_transaction_interest() (BEFORE
-- INSERT) chỉ tự gán now() khi client KHÔNG gửi giá trị nào
-- (`coalesce(new.created_date, now())`) - nhưng mọi nơi tạo giao dịch
-- trong app (DepositModal.jsx, TradeSheet.jsx, StocksTab.jsx) đều LUÔN chủ
-- động gửi kèm `new Date().toISOString()` lấy từ đồng hồ THIẾT BỊ khách
-- hàng, nên nhánh coalesce về now() trên thực tế không bao giờ được dùng
-- tới - đồng hồ thiết bị khách hàng (có thể chỉnh sai, vô tình hoặc cố ý)
-- hoàn toàn quyết định ngày ký ghi trên hợp đồng đầu tư.
--
-- Sửa: LUÔN dùng now() (giờ máy chủ Postgres thật, không ai từ phía khách
-- hàng can thiệp được), bỏ hẳn việc tin giá trị client gửi kèm - đồng nhất
-- với cách các trường khác trong CÙNG trigger này (rate/profit/total/...)
-- đã luôn được tính lại phía server, không tin dữ liệu client gửi lên.
-- matures_at (tính từ created_date + kỳ hạn) tự động đúng theo sau.
--
-- created_date đã được bảo vệ khỏi bị SỬA qua UPDATE từ trước
-- (protect_transaction_financial_fields() - xem migration baseline), nên
-- chỉ cần sửa đúng 1 chỗ duy nhất còn hở là lúc INSERT này.
CREATE OR REPLACE FUNCTION public.compute_transaction_interest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_project record;
begin
  if new.project_id is not null then
    select * into v_project from public.investment_projects where id = new.project_id;
  end if;

  if v_project.id is null then
    raise exception 'compute_transaction_interest: invalid or missing project_id';
  end if;

  new.rate := v_project.total_term_interest_rate;
  new.profit := round(coalesce(new.amount, 0) * v_project.total_term_interest_rate / 100);
  new.total := coalesce(new.amount, 0) + new.profit;
  new.created_date := now();
  new.matures_at := new.created_date + make_interval(mins => v_project.term_duration_minutes);
  new.interest_status := 'pending';
  new.payout_status := coalesce(new.payout_status, 'pending');
  new.status := coalesce(new.status, 'completed');
  new.payout_model := case
    when v_project.category in ('VinHomes', 'Đầu tư nghỉ dưỡng') then 'DAILY_ACCRUAL'
    else 'LUMP_SUM'
  end;

  return new;
end;
$function$;
