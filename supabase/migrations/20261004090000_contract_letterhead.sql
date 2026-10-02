-- Hợp đồng đầu tư dự án dùng chung giao diện với Khung văn bản mặc định
-- (logo, tên đơn vị, Quốc hiệu, người đại diện, chữ ký + con dấu, footer).
-- Bảng document_letterheads chỉ Admin đọc được, nên người dùng xem hợp đồng
-- lấy phần trình bày của khung mặc định đã xuất bản qua hàm này. Chỉ trả các
-- trường hiển thị (không có created_by / lịch sử phiên bản).
CREATE OR REPLACE FUNCTION public.get_contract_letterhead()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
           'id', l.id,
           'version', l.version,
           'header', l.header,
           'issuer', l.issuer,
           'footer', l.footer,
           'theme', l.theme)
    from public.document_letterheads l
   where l.is_default and l.status = 'published'
   limit 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_contract_letterhead() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contract_letterhead() TO authenticated;
