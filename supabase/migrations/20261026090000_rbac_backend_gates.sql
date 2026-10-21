-- Chốt chặn backend cho RBAC (tiếp theo 20261025090000_admin_permissions_rbac):
--   - Cộng/trừ ví NGƯỜI KHÁC: cần quyền wallet_adjust.
--   - Khóa/mở khóa tài khoản (is_locked): cần quyền user_moderate.
--   - Xóa tài khoản: chỉ super admin (thắt lại từ "mọi admin").
--
-- Super admin/chủ sở hữu luôn có mọi quyền (has_admin_permission/is_super_admin).
-- KHÔNG đụng tới luồng của người chơi tự trừ ví (đặt cược) hay duyệt nạp/rút
-- (đã gate riêng bằng tx_approve).

-- 1) increment_user_balance: admin sửa ví NGƯỜI KHÁC phải có wallet_adjust.
--    Giữ nguyên các chặn cũ (người thường chỉ được trừ ví chính mình, không
--    tự cộng, chặn khi bị khóa).
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id text, p_delta bigint, p_total_deposited_delta bigint DEFAULT 0)
 RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if p_user_id is distinct from auth.uid()::text
     and not public.is_admin() then
    raise exception 'not authorized to modify balance for this user';
  end if;

  -- RBAC: admin điều chỉnh ví của NGƯỜI KHÁC cần quyền wallet_adjust.
  if p_user_id is distinct from auth.uid()::text
     and public.is_admin()
     and not public.has_admin_permission('wallet_adjust') then
    raise exception 'not authorized: thiếu quyền wallet_adjust';
  end if;

  if p_user_id = auth.uid()::text
     and not public.is_admin() then
    if exists (
      select 1 from public.users where id = p_user_id and is_locked = true
    ) then
      raise exception 'account is locked';
    end if;

    if p_delta > 0 then
      raise exception 'not authorized to credit your own balance directly';
    end if;
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);

  return query
  update public.users
  set
    balance = greatest(0, public.users.balance + p_delta),
    total_deposited = public.users.total_deposited + p_total_deposited_delta,
    balance_version = public.users.balance_version + 1,
    last_active = now()
  where id = p_user_id
  returning
    public.users.balance,
    public.users.total_deposited,
    public.users.balance_version;
end;
$function$;

-- 2) set_user_balance_absolute (admin sửa cả balance + total_deposited): cần
--    wallet_adjust.
CREATE OR REPLACE FUNCTION public.set_user_balance_absolute(p_user_id text, p_balance bigint, p_total_deposited bigint)
 RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_admin() AND public.has_admin_permission('wallet_adjust')) THEN
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

-- 3) protect_privileged_user_fields: thêm chặn is_locked - chỉ admin có quyền
--    user_moderate (hoặc super admin) mới đổi được trạng thái khóa.
CREATE OR REPLACE FUNCTION public.protect_privileged_user_fields()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.role := old.role;
    new.balance := old.balance;
    new.total_deposited := old.total_deposited;
    new.balance_version := old.balance_version;
    new.is_locked := old.is_locked;
    new.membership_tier := old.membership_tier;
    new.vip_level := old.vip_level;
  end if;

  if new.role is distinct from old.role and not public.is_super_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.role := old.role;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin and not public.is_super_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.is_super_admin := old.is_super_admin;
  end if;

  if new.admin_permissions is distinct from old.admin_permissions and not public.is_super_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.admin_permissions := old.admin_permissions;
  end if;

  -- MỚI: đổi trạng thái khóa tài khoản cần quyền user_moderate.
  if new.is_locked is distinct from old.is_locked
     and not public.has_admin_permission('user_moderate')
     and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.is_locked := old.is_locked;
  end if;

  return new;
end;
$function$;

-- 4) Xóa tài khoản: chỉ super admin (hoặc chính chủ xóa tài khoản của mình).
--    Trước đây mọi admin (is_admin_user) đều xóa được - thắt lại cho khớp
--    giao diện (chỉ super admin thấy nút xóa).
DROP POLICY IF EXISTS "users_delete_own_or_admin" ON public.users;
CREATE POLICY "users_delete_own_or_admin"
  ON public.users FOR DELETE
  USING (
    ((id = (SELECT auth.uid())::text) OR public.is_super_admin())
    AND NOT public.is_anon_session()
  );
