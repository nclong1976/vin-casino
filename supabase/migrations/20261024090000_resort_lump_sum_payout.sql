-- Dự án "Đầu tư nghỉ dưỡng" chuyển từ giải ngân theo ngày (DAILY_ACCRUAL)
-- sang TRẢ 1 LẦN KHI ĐÁO HẠN (LUMP_SUM).
--
-- Lý do: danh mục nghỉ dưỡng nhập kỳ hạn theo GIỜ (getProjectTermUnit() =
-- "giờ"), nhưng cơ chế DAILY_ACCRUAL (disburse_daily_investment_payouts())
-- đếm theo NGÀY tròn: số ngày chu kỳ = floor(phút/1440) tối thiểu 1, số ngày
-- đã trôi = floor(giờ/24). Với kỳ hạn 3 giờ (180 phút) → chu kỳ ép thành 1
-- ngày, sau 3 giờ vẫn là 0 ngày trôi qua nên KHÔNG trả gì; lãi+gốc chỉ về
-- sau đủ 24 giờ. Mốc đáo hạn theo giờ (matures_at) bị bỏ qua vì
-- settle_matured_investments() chỉ xử lý LUMP_SUM.
--
-- Nay nghỉ dưỡng = LUMP_SUM: hết kỳ hạn (vd 3 giờ) settle_matured_investments()
-- trả cả gốc + lãi đúng mốc giờ. CHỈ đổi nhánh payout_model, giữ nguyên mọi
-- tính toán khác. VinHomes vẫn là DAILY_ACCRUAL (sản phẩm nhiều ngày thật).
--
-- Frontend đồng bộ ở src/lib/investmentTerms.js (DAILY_ACCRUAL_CATEGORIES chỉ
-- còn "VinHomes") - mọi nơi hiển thị đều gate theo payout_model/
-- isDailyAccrualCategory nên tự chuyển sang kiểu "trả 1 lần khi đáo hạn".

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
    when v_project.category = 'VinHomes' then 'DAILY_ACCRUAL'
    else 'LUMP_SUM'
  end;

  return new;
end;
$function$;
