-- ============================================================================
-- VinClub — Migration bảo mật: bật Row Level Security (RLS)
-- ============================================================================
-- Chạy TOÀN BỘ file này 1 lần trong Supabase Dashboard → SQL Editor.
-- Không cần backup trước khi chạy - chỉ thêm quyền hạn chế, không xóa dữ liệu.
--
-- BỐI CẢNH: hiện tại mọi bảng đọc/ghi tự do qua khóa "anon" công khai (khóa
-- này nằm sẵn trong mã tải về máy của BẤT KỲ ai mở trang web) - đã kiểm chứng
-- thực tế 1 trình duyệt CHƯA đăng nhập vẫn tự đặt được số dư user bất kỳ lên
-- gần 1.000 tỷ VNĐ. Migration này thêm lớp kiểm tra "ai đang gọi request này"
-- ngay trên Postgres - lớp bảo vệ mà trước giờ ứng dụng hoàn toàn không có.
--
-- GIỚI HẠN CẦN BIẾT (đọc trước khi chạy):
-- Casino/game hiện tính thắng-thua ở PHÍA TRÌNH DUYỆT (client) rồi mới gọi
-- RPC cộng/trừ tiền - migration này ngăn được người lạ chỉnh số dư CỦA NGƯỜI
-- KHÁC, nhưng CHƯA ngăn được 1 người dùng đã đăng nhập tự gọi RPC với số tiền
-- tự bịa cho CHÍNH tài khoản họ (vì Postgres không biết ván bài/vòng quay đó
-- có thật hay không). Muốn đóng triệt để lỗ hổng này cần chuyển logic tính
-- thắng-thua sang chạy ở server (xem đề xuất riêng) - đây là bước lớn hơn,
-- không nằm trong migration này.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Hàm dùng chung: is_admin()
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER để hàm này tự đọc bảng users với quyền cao hơn caller,
-- tránh đệ quy vô hạn khi 1 policy trên chính bảng users cần gọi hàm này (đã
-- từng gặp đúng lớp lỗi đệ quy này trên bảng messages/thread_members).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()::text
      AND (role = 'admin' OR COALESCE((metadata->>'is_super_admin')::boolean, false))
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. users — bảng quan trọng nhất (số dư, quyền, khóa tài khoản)
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT USING (id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS users_delete_admin ON public.users;
CREATE POLICY users_delete_admin ON public.users
  FOR DELETE USING (public.is_admin());

-- Chặn UPDATE trực tiếp lên cột tiền/quyền qua REST, kể cả với chính chủ tài
-- khoản - các cột này CHỈ được đổi qua 2 hàm RPC ở mục 2 (đã tự kiểm tra
-- quyền bên trong) hoặc bởi Admin (policy users_update_admin ở trên đã cho
-- Admin toàn quyền UPDATE mọi cột).
REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT UPDATE (
  name, full_name, phone, avatar_url, bank_name, account_number,
  account_holder, referral_code, last_active, metadata, membership_tier, vip_level
) ON public.users TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RPC tiền bạc — thêm kiểm tra quyền BÊN TRONG hàm (trước đây không có)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_balance_absolute(
  p_user_id text, p_balance bigint, p_total_deposited bigint
) RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ Admin mới được đặt số dư tuyệt đối';
  END IF;
  RETURN QUERY
    UPDATE public.users u
    SET balance = p_balance,
        total_deposited = p_total_deposited,
        balance_version = u.balance_version + 1
    WHERE u.id = p_user_id
    RETURNING u.balance, u.total_deposited, u.balance_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_user_balance(
  p_user_id text, p_delta bigint, p_total_deposited_delta bigint DEFAULT 0
) RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Cho phép: Admin chỉnh bất kỳ ai, HOẶC chính chủ tài khoản tự điều chỉnh
  -- số dư của mình (bắt buộc cho game/đáo hạn tự động của chính họ).
  IF NOT public.is_admin() AND (auth.uid() IS NULL OR p_user_id <> auth.uid()::text) THEN
    RAISE EXCEPTION 'Không có quyền chỉnh số dư tài khoản khác';
  END IF;
  RETURN QUERY
    UPDATE public.users u
    SET balance = u.balance + p_delta,
        total_deposited = u.total_deposited + p_total_deposited_delta,
        balance_version = u.balance_version + 1
    WHERE u.id = p_user_id
    RETURNING u.balance, u.total_deposited, u.balance_version;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. wallet_transactions — lịch sử nạp/rút
-- ----------------------------------------------------------------------------
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wtx_select ON public.wallet_transactions;
CREATE POLICY wtx_select ON public.wallet_transactions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS wtx_insert ON public.wallet_transactions;
CREATE POLICY wtx_insert ON public.wallet_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS wtx_update_admin ON public.wallet_transactions;
CREATE POLICY wtx_update_admin ON public.wallet_transactions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS wtx_delete_admin ON public.wallet_transactions;
CREATE POLICY wtx_delete_admin ON public.wallet_transactions
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. transactions — lịch sử đầu tư/hợp đồng
-- ----------------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tx_select ON public.transactions;
CREATE POLICY tx_select ON public.transactions
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS tx_insert ON public.transactions;
CREATE POLICY tx_insert ON public.transactions
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS tx_update ON public.transactions;
CREATE POLICY tx_update ON public.transactions
  FOR UPDATE USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS tx_delete_admin ON public.transactions;
CREATE POLICY tx_delete_admin ON public.transactions
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. messages — chat CSKH
-- ----------------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msg_select ON public.messages;
CREATE POLICY msg_select ON public.messages
  FOR SELECT USING (
    user_id = auth.uid()::text OR conversation_id = auth.uid()::text OR public.is_admin()
  );

DROP POLICY IF EXISTS msg_insert ON public.messages;
CREATE POLICY msg_insert ON public.messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()::text OR conversation_id = auth.uid()::text OR public.is_admin()
  );

DROP POLICY IF EXISTS msg_update_admin ON public.messages;
CREATE POLICY msg_update_admin ON public.messages
  FOR UPDATE USING (
    user_id = auth.uid()::text OR conversation_id = auth.uid()::text OR public.is_admin()
  ) WITH CHECK (true);

DROP POLICY IF EXISTS msg_delete_admin ON public.messages;
CREATE POLICY msg_delete_admin ON public.messages
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. notifications
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications
  FOR SELECT USING (user_id = auth.uid()::text OR user_id = 'admin' OR public.is_admin());

DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS notif_delete_admin ON public.notifications;
CREATE POLICY notif_delete_admin ON public.notifications
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. bank_accounts
-- ----------------------------------------------------------------------------
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_select ON public.bank_accounts;
CREATE POLICY bank_select ON public.bank_accounts
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS bank_insert ON public.bank_accounts;
CREATE POLICY bank_insert ON public.bank_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS bank_update ON public.bank_accounts;
CREATE POLICY bank_update ON public.bank_accounts
  FOR UPDATE USING (user_id = auth.uid()::text OR public.is_admin())
  WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS bank_delete ON public.bank_accounts;
CREATE POLICY bank_delete ON public.bank_accounts
  FOR DELETE USING (user_id = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. signatures
-- ----------------------------------------------------------------------------
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sig_select ON public.signatures;
CREATE POLICY sig_select ON public.signatures
  FOR SELECT USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS sig_insert ON public.signatures;
CREATE POLICY sig_insert ON public.signatures
  FOR INSERT WITH CHECK (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS sig_delete ON public.signatures;
CREATE POLICY sig_delete ON public.signatures
  FOR DELETE USING (user_id = auth.uid()::text OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. investment_projects — công khai đọc (mọi người dùng cần xem danh mục quỹ),
--    chỉ Admin được sửa.
-- ----------------------------------------------------------------------------
ALTER TABLE public.investment_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proj_select_public ON public.investment_projects;
CREATE POLICY proj_select_public ON public.investment_projects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS proj_write_admin ON public.investment_projects;
CREATE POLICY proj_write_admin ON public.investment_projects
  FOR INSERT WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS proj_update_admin ON public.investment_projects;
CREATE POLICY proj_update_admin ON public.investment_projects
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS proj_delete_admin ON public.investment_projects;
CREATE POLICY proj_delete_admin ON public.investment_projects
  FOR DELETE USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. audit_logs — chỉ Admin đọc/ghi
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_only ON public.audit_logs;
CREATE POLICY audit_admin_only ON public.audit_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- XONG. Kiểm tra nhanh sau khi chạy (dán vào SQL Editor, chạy riêng):
--
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and rowsecurity = true;
--
-- Phải thấy đủ 8 bảng: users, wallet_transactions, transactions, messages,
-- notifications, bank_accounts, signatures, investment_projects, audit_logs.
-- ============================================================================
