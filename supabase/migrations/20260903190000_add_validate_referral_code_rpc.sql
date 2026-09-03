-- Mã giới thiệu bắt buộc lúc đăng ký trước đây được so sánh cứng ("E-CUV")
-- ngay trong mã nguồn chạy ở trình duyệt (src/pages/Register.jsx) - bất kỳ
-- ai xem View Source/DevTools đều thấy được, khiến việc bắt buộc mã giới
-- thiệu không còn ý nghĩa chặn. Chuyển việc so sánh vào 1 RPC phía server,
-- ẩn giá trị thật khỏi bundle JS gửi cho trình duyệt.
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT upper(trim(coalesce(p_code, ''))) = 'E-CUV';
$function$;

-- Cần gọi được TRƯỚC khi đăng nhập (đang trong luồng đăng ký) nên phải cho
-- anon gọi - hàm chỉ trả về true/false, không đọc/ghi gì nhạy cảm.
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;
