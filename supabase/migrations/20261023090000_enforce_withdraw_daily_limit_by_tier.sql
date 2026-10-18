-- Thực thi (enforce) hạn mức RÚT TIỀN theo ngày theo hạng hội viên - trước
-- đây các con số này chỉ là chữ hiển thị trong mục Quy định
-- (AppRulesModal), luồng rút thực tế chỉ chặn mức tối thiểu + số dư, KHÔNG
-- hề chặn khi vượt hạn mức ngày. Nay Postgres là nguồn sự thật cuối cùng:
-- mọi lệnh rút (type='withdraw') đều bị kiểm tra ngay lúc INSERT, kể cả khi
-- có ai gọi thẳng API bỏ qua giao diện.
--
-- Hạn mức/ngày theo hạng (VNĐ):
--   Member    : 1.000.000.000
--   Gold      : 5.000.000.000
--   Platinum  : 10.000.000.000
--   Diamond   : KHÔNG giới hạn
--
-- Chỉ áp cho type='withdraw' (rút tiền về ngân hàng). KHÔNG áp cho
-- type='withdrawal' (đặt cược casino) - đó là luồng khác.
--
-- "Ngày" tính theo giờ Việt Nam (Asia/Ho_Chi_Minh). created_date của lệnh
-- rút bị ÉP = now() (giờ máy chủ) ngay trong trigger này để mốc ngày không
-- thể bị chỉnh từ đồng hồ thiết bị khách - đồng nhất với cách
-- compute_transaction_interest() đã làm cho bảng transactions.
--
-- Tổng đã rút trong ngày = các lệnh 'pending' + 'approved' + 'completed'
-- (lệnh bị 'rejected' đã được hoàn tiền nên không tính). Lệnh pending vẫn
-- tính để không thể tạo chồng nhiều lệnh pending vượt hạn mức cùng lúc.

CREATE OR REPLACE FUNCTION public.enforce_withdraw_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_tier text;
  v_limit bigint;
  v_today date;
  v_already bigint;
begin
  if coalesce(new.type, '') <> 'withdraw' then
    return new;
  end if;

  -- Mốc ngày theo giờ VN, ép created_date = giờ máy chủ (chống spoof).
  new.created_date := now();
  v_today := (new.created_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  select u.membership_tier into v_tier
    from public.users u where u.id = new.user_id;

  -- Hạn mức theo hạng (khớp ILIKE, hỗ trợ cả tên tiếng Việt lẫn các biến
  -- thể như 'VIP 1 - Gold'). Diamond => NULL => không giới hạn.
  v_limit := case
    when v_tier ILIKE '%diamond%' or v_tier ILIKE '%kim cương%' then null
    when v_tier ILIKE '%platinum%' or v_tier ILIKE '%bạch kim%' then 10000000000
    when v_tier ILIKE '%gold%' or v_tier ILIKE '%vàng%' then 5000000000
    else 1000000000
  end;

  if v_limit is null then
    return new; -- Diamond: bỏ qua
  end if;

  select coalesce(sum(wt.amount), 0) into v_already
    from public.wallet_transactions wt
   where wt.user_id = new.user_id
     and wt.type = 'withdraw'
     and wt.status in ('pending', 'approved', 'completed')
     and (wt.created_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today;

  if v_already + new.amount > v_limit then
    raise exception 'WITHDRAW_DAILY_LIMIT_EXCEEDED: hạn mức rút trong ngày của hạng % là % VNĐ. Hôm nay đã rút % VNĐ, còn lại % VNĐ.',
      coalesce(v_tier, 'Member'), v_limit, v_already, greatest(0, v_limit - v_already)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.enforce_withdraw_daily_limit() FROM PUBLIC, anon, authenticated;

-- Tên 'trg_a_...' để chạy SỚM (trigger BEFORE cùng bảng chạy theo thứ tự
-- tên) - chặn trước khi các trigger khác chạy.
DROP TRIGGER IF EXISTS trg_a_enforce_withdraw_daily_limit ON public.wallet_transactions;
CREATE TRIGGER trg_a_enforce_withdraw_daily_limit
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_withdraw_daily_limit();
