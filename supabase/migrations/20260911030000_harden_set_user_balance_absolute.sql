-- LỖ HỔNG NGHIÊM TRỌNG: set_user_balance_absolute() trước đây KHÔNG kiểm
-- tra quyền gọi (khác với increment_user_balance() đứng cạnh nó - đã có
-- guard is_admin()/tự chủ tài khoản đầy đủ). Vì hàm này được cấp EXECUTE
-- cho role "authenticated" (xem migration harden_rpc_execute_grants), BẤT
-- KỲ hội viên nào đăng nhập cũng gọi thẳng được RPC này qua REST API để tự
-- đặt số dư ví (balance/total_deposited) của CHÍNH HỌ hoặc người khác thành
-- bất kỳ số tiền nào - không cần nạp tiền thật, không qua duyệt admin.
--
-- Vá bằng cách thêm ĐÚNG 1 điều kiện is_admin() giống hệt pattern các hàm
-- admin-only khác đã dùng (process_wallet_transaction,
-- protect_transaction_financial_fields) - không đổi tên hàm, tham số, kiểu
-- trả về hay logic UPDATE bên trong, nên nơi gọi duy nhất trong app
-- (UserDetailModal.jsx, qua setAbsoluteUserBalanceAndDeposit()) không cần
-- sửa gì và hoạt động y hệt như trước đối với admin thật.
--
-- Nhân tiện thêm "SET search_path TO 'public'" (increment_user_balance() đã
-- có sẵn dòng này, hàm này thì thiếu - advisor Supabase từng cảnh báo
-- "Function Search Path Mutable" cho đúng hàm này).
CREATE OR REPLACE FUNCTION public.set_user_balance_absolute(p_user_id text, p_balance bigint, p_total_deposited bigint)
 RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to set balance for this user';
  END IF;

  RETURN QUERY
  UPDATE public.users
  SET balance = GREATEST(0, p_balance),
      total_deposited = GREATEST(0, p_total_deposited),
      balance_version = public.users.balance_version + 1,
      last_active = NOW()
  WHERE id = p_user_id
  RETURNING public.users.balance, public.users.total_deposited, public.users.balance_version;
END;
$function$;
