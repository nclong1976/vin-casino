-- "Tổng đã nạp" (users.total_deposited) = tiền nạp được quản trị viên PHÊ
-- DUYỆT + tiền quản trị viên CỘNG TRỰC TIẾP vào ví. KHÔNG tính lãi dự án,
-- lãi ngày, đáo hạn, thưởng, thắng casino, tiền hoàn do lệnh rút bị từ chối.
--
-- Trước đây cột này được cộng dồn từ nhiều nơi (increment_user_balance,
-- process_wallet_transaction, ô sửa tay trong UserDetailModal, nút "Cộng
-- tiền" cộng cho MỌI khoản kể cả giải ngân/thưởng...) nên bị lệch so với
-- lịch sử ví. Nay Postgres tự tính lại từ wallet_transactions mỗi khi lịch
-- sử ví hoặc cột này thay đổi - mọi giá trị client gửi lên đều bị thay bằng
-- giá trị tính từ sổ cái.
--
-- Một giao dịch được tính là tiền nạp khi type = 'deposit', đã chốt
-- (completed/approved) và:
--   - là yêu cầu nạp của người chơi đã được duyệt (mã VCD...), hoặc
--   - được quản trị viên cộng trực tiếp và đánh dấu category
--     'Nạp Tiền Trực Tiếp' (AdminWalletModal.jsx).

CREATE OR REPLACE FUNCTION public.wallet_tx_counts_as_deposit(
  p_type text, p_status text, p_code text, p_category text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  select coalesce(p_type, '') = 'deposit'
     and coalesce(p_status, '') in ('completed', 'approved')
     and (coalesce(p_code, '') like 'VCD%' or p_category = 'Nạp Tiền Trực Tiếp');
$$;

CREATE OR REPLACE FUNCTION public.compute_total_deposited(p_user_id text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select coalesce(sum(amount), 0)::bigint
  from public.wallet_transactions
  where user_id = p_user_id
    and public.wallet_tx_counts_as_deposit(type, status, code, category);
$$;

REVOKE EXECUTE ON FUNCTION public.compute_total_deposited(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_total_deposited(text) TO authenticated, service_role;

-- Tên bắt đầu bằng "trg_zz_" để chạy SAU trg_protect_privileged_user_fields
-- (trigger BEFORE cùng bảng chạy theo thứ tự tên): dù request là của ai,
-- giá trị cuối cùng luôn là giá trị tính từ sổ cái.
CREATE OR REPLACE FUNCTION public.derive_user_total_deposited()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  new.total_deposited := public.compute_total_deposited(new.id);
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_zz_derive_total_deposited ON public.users;
CREATE TRIGGER trg_zz_derive_total_deposited
  BEFORE INSERT OR UPDATE OF total_deposited ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.derive_user_total_deposited();

CREATE OR REPLACE FUNCTION public.sync_total_deposited_from_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.users u
       set total_deposited = public.compute_total_deposited(u.id)
     where u.id = old.user_id
       and u.total_deposited is distinct from public.compute_total_deposited(u.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.users u
       set total_deposited = public.compute_total_deposited(u.id)
     where u.id = new.user_id
       and u.total_deposited is distinct from public.compute_total_deposited(u.id);
  end if;
  return null;
end;
$$;

DROP TRIGGER IF EXISTS trg_sync_total_deposited ON public.wallet_transactions;
CREATE TRIGGER trg_sync_total_deposited
  AFTER INSERT OR UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_total_deposited_from_wallet_tx();

-- Lần cộng tiền từ giao diện Admin cũ (chưa gửi category) với mô tả mặc
-- định vẫn được đánh dấu là tiền nạp trực tiếp, để không bị bỏ sót trong
-- lúc bản web mới chưa triển khai.
CREATE OR REPLACE FUNCTION public.tag_admin_direct_deposit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if new.type = 'deposit' and new.category is null and coalesce(new.code, '') like 'VCW%'
     and (btrim(coalesce(new.description, '')) ilike 'Admin cộng tiền vào ví'
          or btrim(coalesce(new.description, '')) ilike 'Nạp tiền trực tiếp%') then
    new.category := 'Nạp Tiền Trực Tiếp';
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_tag_admin_direct_deposit ON public.wallet_transactions;
CREATE TRIGGER trg_tag_admin_direct_deposit
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tag_admin_direct_deposit();

-- Đánh dấu các lần "Admin cộng tiền" cũ là tiền nạp trực tiếp (nút Cộng
-- tiền ghi mô tả mặc định "Admin cộng tiền vào ví", hoặc admin tự ghi
-- "Nạp tiền trực tiếp..."). Các lần cộng có ghi chú khác (giải ngân dự án,
-- ưu đãi ký hợp đồng...) là thưởng/lãi - chuyển sang 'Admin Cộng Thưởng'
-- để không tính vào tổng nạp và hiển thị đúng là "Thưởng / Lãi".
-- Giao dịch VCW 'approved' không có mô tả (nguồn chưa rõ) giữ nguyên, chưa
-- tính, chờ xác nhận.
UPDATE public.wallet_transactions
   SET category = 'Nạp Tiền Trực Tiếp'
 WHERE type = 'deposit'
   AND category IS NULL
   AND code LIKE 'VCW%'
   AND status IN ('completed', 'approved')
   AND (btrim(description) ILIKE 'Admin cộng tiền vào ví' OR btrim(description) ILIKE 'Nạp tiền trực tiếp%');

UPDATE public.wallet_transactions
   SET category = 'Admin Cộng Thưởng'
 WHERE type = 'deposit'
   AND category IS NULL
   AND code LIKE 'VCW%'
   AND status IN ('completed', 'approved')
   AND coalesce(btrim(description), '') <> '';

-- Tính lại cho toàn bộ tài khoản.
UPDATE public.users SET total_deposited = 0;
