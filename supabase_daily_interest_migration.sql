-- ============================================================================
-- VinClub — Migration: cộng lãi hàng ngày theo cấp VIP (admin bật/tắt thủ công)
-- ============================================================================
-- Chạy trong Supabase Dashboard → SQL Editor, SAU khi đã chạy
-- supabase_wallet_columns_migration.sql (cần cột category/note đã tồn tại).
--
-- BỐI CẢNH: cơ chế cộng lãi tự động 9h sáng cũ đã bị xóa hoàn toàn vì gây race
-- condition cộng lãi lặp vô hạn (mỗi trình duyệt người dùng tự poll và tự
-- kiểm tra "đã cộng lãi hôm nay chưa" phía client). Migration này dựng lại cơ
-- chế cộng lãi theo % cấp thẻ VIP nhưng an toàn tận gốc:
--   1. Toàn bộ tính toán + ghi tiền nằm trong 1 câu lệnh SQL set-based DUY
--      NHẤT (không phải vòng lặp đọc-rồi-ghi phía JS) - điều kiện chống lặp
--      (last_interest_credited_date < CURRENT_DATE) nằm ngay trong WHERE của
--      chính câu UPDATE, nên dù hàm bị gọi trùng bao nhiêu lần trong ngày,
--      mỗi user chỉ được cộng đúng 1 lần.
--   2. Hàm CHỈ được gọi bởi service_role (tiến trình server, không phải
--      trình duyệt của bất kỳ ai) - REVOKE khỏi anon/authenticated.
--   3. daily_interest_enabled mặc định FALSE cho mọi user - chỉ tài khoản
--      admin tự tay bật (qua UserDetailModal.jsx) mới được cộng lãi.
-- ============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_interest_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_interest_credited_date date;

CREATE OR REPLACE FUNCTION public.credit_daily_interest_batch()
RETURNS TABLE(user_id text, credited_amount bigint, new_balance bigint, tier_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT u.id, u.balance,
      CASE
        WHEN u.membership_tier ILIKE '%diamond%' OR u.membership_tier ILIKE '%kim cương%' THEN 0.012
        WHEN u.membership_tier ILIKE '%platinum%' OR u.membership_tier ILIKE '%bạch kim%' THEN 0.008
        WHEN u.membership_tier ILIKE '%gold%' OR u.membership_tier ILIKE '%vàng%' THEN 0.004
        ELSE 0.002
      END AS rate
    FROM public.users u
    WHERE u.daily_interest_enabled = true
      AND u.is_locked = false
      AND (u.last_interest_credited_date IS NULL OR u.last_interest_credited_date < CURRENT_DATE)
    FOR UPDATE OF u SKIP LOCKED
  ),
  computed AS (
    SELECT id, rate, FLOOR(balance * rate)::bigint AS amount
    FROM eligible
    WHERE FLOOR(balance * rate)::bigint > 0
  ),
  updated AS (
    UPDATE public.users u
    SET balance = u.balance + c.amount,
        balance_version = u.balance_version + 1,
        last_interest_credited_date = CURRENT_DATE
    FROM computed c
    WHERE u.id = c.id
    RETURNING u.id, c.amount AS credited_amount, u.balance AS new_balance, c.rate AS tier_rate
  ),
  logged AS (
    INSERT INTO public.wallet_transactions (id, user_id, type, amount, status, category, note, code, created_date)
    SELECT
      'wtx_int_' || up.id || '_' || to_char(CURRENT_DATE, 'YYYYMMDD'),
      up.id,
      'bonus',
      up.credited_amount,
      'approved',
      'Lãi Hàng Ngày Theo Cấp VIP',
      'Lãi ngày ' || to_char(CURRENT_DATE, 'DD/MM/YYYY') || ' (' || (up.tier_rate * 100) || '%/ngày) [ref:interest:' || up.id || ':' || to_char(CURRENT_DATE, 'YYYYMMDD') || ']',
      'LAI' || to_char(CURRENT_DATE, 'YYYYMMDD') || upper(right(up.id, 6)),
      now()
    FROM updated up
    ON CONFLICT (id) DO NOTHING
  )
  SELECT * FROM updated;
END;
$$;

-- Chỉ tiến trình server (giữ service_role key riêng, KHÔNG bao giờ lộ ra
-- trình duyệt) mới được gọi hàm này - kể cả người dùng đã đăng nhập cũng
-- không thể tự gọi RPC này để tự cộng lãi cho chính mình.
REVOKE EXECUTE ON FUNCTION public.credit_daily_interest_batch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_daily_interest_batch() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_daily_interest_batch() TO service_role;

-- ============================================================================
-- Kiểm tra sau khi chạy (dán vào SQL Editor, chạy riêng):
--
--   -- 1. Xác nhận 2 cột mới tồn tại:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'users'
--     and column_name in ('daily_interest_enabled', 'last_interest_credited_date');
--
--   -- 2. Bật thử 1 tài khoản test rồi gọi hàm thủ công xem có cộng đúng
--   --    không (thay 'USER_ID_TEST' bằng id thật của 1 tài khoản test):
--   update public.users set daily_interest_enabled = true where id = 'USER_ID_TEST';
--   select * from credit_daily_interest_batch();
--   -- Gọi lại lần 2 ngay lập tức - PHẢI trả về rỗng (đã cộng hôm nay rồi):
--   select * from credit_daily_interest_batch();
-- ============================================================================
