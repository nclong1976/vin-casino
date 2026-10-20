-- Phân quyền chi tiết cho từng tài khoản admin (RBAC).
--
-- Trước đây chỉ có 2 mức: admin (thấy mọi mục) và super admin. Nay mỗi admin
-- được gán 1 DANH SÁCH quyền (users.admin_permissions) - bật/tắt từng mục.
-- Super admin / chủ sở hữu (is_super_admin) luôn có toàn quyền.
--
-- Các khóa quyền (phải khớp src/lib/adminPermissions.js):
--   cskh              - Tin nhắn CSKH
--   members           - Quản lý Hội viên & Giao dịch (xem)
--   tx_approve        - Duyệt nạp / rút tiền
--   wallet_adjust     - Cộng / trừ tiền ví
--   user_moderate     - Khóa / mở khóa tài khoản
--   investment_casino - Đầu tư CK & Casino
--   projects          - Dự án
--   news              - Tin tức & Thông báo
--   esign             - Văn bản
--   settings          - Cài đặt hệ thống
--
-- Chặn 2 lớp: giao diện (adminPermissions.js) + backend (has_admin_permission()
-- gắn vào RPC/RLS). Migration này gate RPC duyệt nạp/rút (tx_approve); các RPC
-- khác gate dần ở migration sau.

-- 1) Cột danh sách quyền.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_permissions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.admin_permissions IS 'Danh sách khóa quyền admin (RBAC). Chỉ có ý nghĩa với tài khoản admin. Super admin/chủ sở hữu luôn toàn quyền, không cần cột này. Chỉ super admin được sửa cột này (protect_privileged_user_fields).';

-- 2) Hàm kiểm tra quyền - dùng cho cả RPC lẫn RLS. Super admin/chủ sở hữu
--    (is_super_admin) luôn true.
CREATE OR REPLACE FUNCTION public.has_admin_permission(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin()
     OR COALESCE(
          (SELECT p_key = ANY(u.admin_permissions)
             FROM public.users u WHERE u.id = auth.uid()::text),
          false);
$function$;

REVOKE ALL ON FUNCTION public.has_admin_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(text) TO authenticated, service_role;

-- 3) Bù quyền ĐẦY ĐỦ cho các admin hiện có, để không ai đang làm việc bị mất
--    quyền ngay khi bật RBAC. Chủ sở hữu sau đó tự thu hẹp từng tài khoản.
UPDATE public.users
   SET admin_permissions = ARRAY[
         'cskh','members','tx_approve','wallet_adjust','user_moderate',
         'investment_casino','projects','news','esign','settings']
 WHERE (role IN ('admin','ADMIN') OR COALESCE(is_super_admin, false))
   AND COALESCE(array_length(admin_permissions, 1), 0) = 0;

-- 4) Chỉ super admin (chủ sở hữu) được sửa admin_permissions - chặn admin
--    thường tự nâng quyền cho mình/người khác qua PostgREST. Giữ nguyên các
--    field được bảo vệ sẵn, chỉ THÊM admin_permissions.
CREATE OR REPLACE FUNCTION public.protect_privileged_user_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin()
     and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.role := old.role;
    new.balance := old.balance;
    new.total_deposited := old.total_deposited;
    new.balance_version := old.balance_version;
    new.is_locked := old.is_locked;
    new.membership_tier := old.membership_tier;
    new.vip_level := old.vip_level;
  end if;

  if new.role is distinct from old.role
     and not public.is_super_admin()
     and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.role := old.role;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin
     and not public.is_super_admin()
     and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.is_super_admin := old.is_super_admin;
  end if;

  -- MỚI: admin_permissions chỉ super admin (chủ sở hữu) được đổi.
  if new.admin_permissions is distinct from old.admin_permissions
     and not public.is_super_admin()
     and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.admin_permissions := old.admin_permissions;
  end if;

  return new;
end;
$function$;

-- 5) Gate RPC duyệt nạp/rút bằng quyền tx_approve (ngoài is_admin).
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(p_tx_id text, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS wallet_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx public.wallet_transactions;
  v_admin_email text;
  v_title text;
  v_content text;
  v_refund_code text;
  v_user_identifier text;
  v_user_email text;
  v_new_balance bigint;
  v_account_label text;
  v_vn_now timestamptz;
begin
  if not (public.is_admin() and public.has_admin_permission('tx_approve')) then
    raise exception 'not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_ACTION';
  end if;

  v_admin_email := coalesce(auth.jwt() ->> 'email', 'admin');

  select * into v_tx from public.wallet_transactions
  where id = p_tx_id and status = 'pending' and type in ('deposit', 'withdraw')
  for update;

  if not found then
    raise exception 'ALREADY_PROCESSED';
  end if;

  if p_action = 'approve' then
    update public.wallet_transactions set
      status = 'completed', approved_at = now(), approved_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    v_vn_now := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';

    if v_tx.type = 'deposit' then
      perform set_config('app.trusted_balance_rpc', 'on', true);
      update public.users set
        balance = greatest(0, balance + v_tx.amount),
        total_deposited = total_deposited + v_tx.amount,
        balance_version = balance_version + 1,
        last_active = now(),
        first_deposit_date = coalesce(first_deposit_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        where id = v_tx.user_id
        returning identifier, email, balance into v_user_identifier, v_user_email, v_new_balance;

      v_account_label := coalesce(nullif(v_user_identifier, ''), split_part(coalesce(v_user_email, ''), '@', 1), v_tx.user_id);

      v_title := 'Biến động số dư';
      v_content := 'TK ' || v_account_label || ': +' || to_char(v_tx.amount, 'FM999,999,999,999') ||
        ' VND luc ' || to_char(v_vn_now, 'HH24:MI') || ' ' || to_char(v_vn_now, 'DD/MM/YYYY') ||
        '. SD: ' || to_char(v_new_balance, 'FM999,999,999,999') || ' VND. ND: CT CP VINCLUB CHUYEN TIEN';
    else
      v_title := 'Lệnh rút tiền đã hoàn tất';
      v_content := 'Dạ lệnh rút ' || to_char(v_tx.amount, 'FM999,999,999,999') || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách đã được duyệt và chuyển khoản về ' ||
        coalesce(nullif(v_tx.bank_name, ''), 'tài khoản ngân hàng') ||
        coalesce(' (•••• ' || nullif(right(coalesce(v_tx.account_number, ''), 4), '') || ')', '') ||
        ' thành công. Quý khách vui lòng kiểm tra tài khoản ngân hàng ạ.';
    end if;
  else
    update public.wallet_transactions set
      status = 'rejected', rejection_reason = p_reason, rejected_at = now(), rejected_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    if v_tx.type = 'withdraw' then
      perform set_config('app.trusted_balance_rpc', 'on', true);
      update public.users set
        balance = greatest(0, balance + v_tx.amount),
        balance_version = balance_version + 1,
        last_active = now()
        where id = v_tx.user_id;

      v_refund_code := 'REF' || to_char(clock_timestamp(), 'FMHH24MISS') || substr(v_tx.id, -4);
      insert into public.wallet_transactions(id, user_id, type, amount, status, description, code)
      values (
        gen_random_uuid()::text, v_tx.user_id, 'deposit', v_tx.amount, 'completed',
        'Hoàn tiền do lệnh rút ' || coalesce(v_tx.code, v_tx.id) || ' bị từ chối: ' || coalesce(p_reason, ''),
        v_refund_code
      );

      v_title := 'Lệnh rút tiền bị từ chối';
      v_content := 'Dạ rất tiếc, lệnh rút ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách chưa thể xử lý do: ' || coalesce(p_reason, '') || '. Số tiền đã được hoàn trả nguyên vẹn vào ví VinClub, Quý khách vui lòng kiểm tra lại ạ.';
    else
      v_title := 'Yêu cầu nạp tiền bị từ chối';
      v_content := 'Dạ rất tiếc, yêu cầu nạp ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
        ') của Quý khách chưa thể xử lý do: ' || coalesce(p_reason, '') || '. Quý khách vui lòng kiểm tra lại và gửi lại yêu cầu ạ.';
    end if;
  end if;

  insert into public.notifications(id, user_id, title, content, type, is_read, created_date)
  values (
    'ntf_wtx_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_' || floor(random() * 1000)::int,
    v_tx.user_id, v_title, v_content, v_tx.type, false, now()
  );

  insert into public.audit_logs(id, action, tx_code, amount, user_id, admin_email, notes)
  values (
    gen_random_uuid()::text,
    case when p_action = 'approve' then
      (case when v_tx.type = 'deposit' then 'APPROVE_DEPOSIT' else 'APPROVE_WITHDRAWAL' end)
    else
      (case when v_tx.type = 'deposit' then 'REJECT_DEPOSIT' else 'REJECT_WITHDRAWAL' end)
    end,
    coalesce(v_tx.code, v_tx.id), v_tx.amount, v_tx.user_id, v_admin_email, v_content
  );

  return v_tx;
end;
$function$;
