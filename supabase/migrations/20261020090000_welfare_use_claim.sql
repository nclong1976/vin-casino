-- Ưu đãi phúc lợi: người chơi tự xác nhận đã dùng voucher tại quầy (không có
-- màn Admin đánh dấu). Chỉ chủ voucher, chỉ voucher còn hạn và chưa dùng;
-- không hoàn tác.
CREATE OR REPLACE FUNCTION public.use_welfare_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid text := auth.uid()::text;
  c public.welfare_claims%rowtype;
begin
  if v_uid is null then
    raise exception 'Vui lòng đăng nhập';
  end if;
  select * into c from public.welfare_claims where id = p_claim_id for update;
  if not found or c.user_id <> v_uid then
    raise exception 'Không tìm thấy voucher';
  end if;
  if c.used_at is not null then
    raise exception 'Voucher đã được sử dụng';
  end if;
  if c.expires_at <= now() then
    raise exception 'Voucher đã hết hạn';
  end if;

  update public.welfare_claims set used_at = now(), used_by = v_uid where id = c.id returning * into c;
  return row_to_json(c)::jsonb;
end;
$$;

REVOKE ALL ON FUNCTION public.use_welfare_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_welfare_claim(uuid) TO authenticated;
