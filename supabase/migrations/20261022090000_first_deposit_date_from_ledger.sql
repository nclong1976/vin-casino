-- Sửa lỗi: admin bật "Lãi hằng ngày theo hạng thẻ" nhưng tới 9h sáng tài
-- khoản vẫn không được cộng lãi.
--
-- Nguyên nhân: credit_daily_interest_batch() chỉ cộng lãi cho tài khoản có
-- users.first_deposit_date (mốc "chờ qua ngày hôm sau" - migration
-- 20260905182657). Cột này trước đây chỉ được ghi trong
-- process_wallet_transaction/telegram_process_wallet_transaction (duyệt yêu
-- cầu nạp của hội viên). Tiền do Admin cộng trực tiếp vào ví
-- (AdminWalletModal.jsx - adjust balance + insert wallet_transactions
-- type='deposit') KHÔNG đi qua 2 hàm đó nên first_deposit_date mãi là NULL
-- → tài khoản bị loại khỏi danh sách cộng lãi dù đã bật.
--
-- Cách sửa: giống total_deposited (20261001124311), Postgres tự ghi mốc nạp
-- đầu tiên từ sổ cái ví - mọi giao dịch type='deposit' đã chốt
-- (completed/approved) đều tính, bất kể đi qua đường nào. COALESCE/LEAST giữ
-- đúng ý "chỉ mốc nạp ĐẦU TIÊN có ý nghĩa" - nạp thêm không đẩy lùi lịch.

CREATE OR REPLACE FUNCTION public.sync_first_deposit_date_from_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_date date;
begin
  if new.type = 'deposit' and new.status in ('completed', 'approved') then
    v_date := (coalesce(new.created_date, now()) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    update public.users u
       set first_deposit_date = v_date
     where u.id = new.user_id
       and (u.first_deposit_date is null or u.first_deposit_date > v_date);
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_first_deposit_date_from_wallet_tx() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_first_deposit_date ON public.wallet_transactions;
CREATE TRIGGER trg_sync_first_deposit_date
  AFTER INSERT OR UPDATE OF status, type ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_first_deposit_date_from_wallet_tx();

-- Bù dữ liệu cho các tài khoản đã được Admin cộng tiền trực tiếp nhưng
-- chưa có mốc nạp đầu tiên (đang bị bỏ qua khi cộng lãi).
UPDATE public.users u
   SET first_deposit_date = sub.first_dep
  FROM (
    SELECT user_id, MIN((created_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS first_dep
      FROM public.wallet_transactions
     WHERE type = 'deposit' AND status IN ('approved', 'completed')
     GROUP BY user_id
  ) sub
 WHERE u.id = sub.user_id
   AND (u.first_deposit_date IS NULL OR u.first_deposit_date > sub.first_dep);
