-- Vá lỗ hổng leo thang đặc quyền: protect_privileged_user_fields() (trigger
-- BEFORE UPDATE trên public.users) trước đây chỉ chặn NGƯỜI DÙNG THƯỜNG sửa
-- role/balance/is_locked/... (điều kiện "NOT is_admin()") - nghĩa là BẤT KỲ
-- admin thường nào cũng đổi được cột "role" của chính mình hoặc người khác
-- thành 'admin', dù UserDetailModal.jsx phía client trước đây cũng không hề
-- gate dropdown "Vai trò hệ thống" bằng isSuperAdmin (khác hẳn nút xóa vĩnh
-- viễn, vốn đã đúng gate isSuperAdmin từ trước). Không có gate nào ở tầng
-- Postgres nghĩa là 1 admin thường có thể tự cấp quyền Admin cho bất kỳ ai
-- chỉ bằng 1 lệnh PATCH REST thẳng, bỏ qua hoàn toàn UI.
--
-- Phát hiện thêm khi viết migration này: cột "is_super_admin" mà
-- src/lib/syncEngine.js, src/lib/supabaseAuth.js, src/lib/isAdminUser.js đều
-- đã đọc/ghi (dbUser?.is_super_admin, meta.is_super_admin...) CHƯA TỪNG tồn
-- tại thật trên bảng public.users - toàn bộ nhánh code đó luôn nhận undefined
-- và âm thầm rơi về đúng 2 email bootstrap owner hardcode. Thêm cột thật ở
-- đây để 3 nơi trên hoạt động đúng như thiết kế ban đầu, thay vì vá riêng 1
-- function SQL tham chiếu tới cột không tồn tại.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_super_admin IS 'Cấp cao hơn role=admin thường - dùng cho thao tác không thể hoàn tác (xóa vĩnh viễn user, đổi role người khác). Xem is_super_admin(), isSuperAdminUser() (client).';

-- Thêm is_super_admin() (đúng mẫu is_admin() đã có) + 1 guard RIÊNG chỉ áp
-- dụng cho cột "role": nếu role thực sự đổi và người gọi không phải Super
-- Admin, revert lại role cũ - không đụng gì tới 6 cột còn lại (balance,
-- is_locked, membership_tier...) vẫn cho phép mọi admin sửa như thiết kế cũ.

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT is_super_admin FROM public.users WHERE id = auth.uid()::text), false)
    OR lower(COALESCE((auth.jwt() ->> 'email'), '')) = ANY (ARRAY['nclong1976@gmail.com','leo1102@vinclub.com']);
$function$;

CREATE OR REPLACE FUNCTION public.protect_privileged_user_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin()
     AND current_setting('app.trusted_balance_rpc', true) IS DISTINCT FROM 'on' THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    NEW.total_deposited := OLD.total_deposited;
    NEW.balance_version := OLD.balance_version;
    NEW.is_locked := OLD.is_locked;
    NEW.membership_tier := OLD.membership_tier;
    NEW.vip_level := OLD.vip_level;
  END IF;

  -- Nâng vai trò lên 'admin' là hành động đặc quyền cao nhất - chỉ Super
  -- Admin mới được đổi cột "role", ngay cả khi người gọi ĐÃ LÀ admin thường
  -- (nhánh is_admin() ở trên không chặn được trường hợp này vì is_admin()
  -- đã trả về true cho chính admin thường đó).
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_super_admin()
     AND current_setting('app.trusted_balance_rpc', true) IS DISTINCT FROM 'on' THEN
    NEW.role := OLD.role;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;
