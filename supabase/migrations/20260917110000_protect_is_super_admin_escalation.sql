-- LỖ HỔNG LEO THANG ĐẶC QUYỀN (phát hiện khi rà soát để thêm ô is_super_admin
-- vào UserDetailModal.jsx admin): cột is_super_admin (cấp quyền CAO NHẤT hệ
-- thống - is_super_admin() cho phép xoá vĩnh viễn tài khoản, xoá tin nhắn
-- CSKH, và isAdminUser() cũng coi is_super_admin=true là admin luôn) trước
-- đây KHÔNG được protect_privileged_user_fields() bảo vệ - trigger đó chỉ
-- reset lại role/balance/total_deposited/balance_version/is_locked/
-- membership_tier/vip_level cho request không phải admin, và chỉ riêng cột
-- "role" mới bị chặn escalation (phải đã là super admin mới đổi được).
-- RLS users_update_own_or_admin cho phép user tự UPDATE ĐÚNG DÒNG của chính
-- mình (id = auth.uid()) - RLS chỉ chặn theo DÒNG, không chặn theo CỘT, nên
-- bất kỳ ai đã đăng nhập có thể gọi thẳng
-- `supabase.from('users').update({is_super_admin: true}).eq('id', myId)`
-- để tự cấp quyền Super Admin cho chính mình, trigger cũ không hề cản.
-- Vá bằng đúng mẫu đã áp dụng cho "role": đổi is_super_admin chỉ được giữ
-- nguyên giá trị mới NẾU actor hiện tại (auth.uid() thực hiện request) đã
-- là super admin từ trước.
create or replace function public.protect_privileged_user_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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

  return new;
end;
$$;
