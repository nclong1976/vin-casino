-- ============================================================================
-- VinClub — Migration: bổ sung cột category/note cho wallet_transactions
-- ============================================================================
-- Chạy trong Supabase Dashboard → SQL Editor, SAU khi đã chạy
-- supabase_rls_migration.sql.
--
-- LÝ DO: bảng wallet_transactions hiện KHÔNG có 2 cột này. Mã ứng dụng khi
-- tạo giao dịch (nạp/rút/đáo hạn dự án...) luôn gửi kèm "category" (để phân
-- loại: Nạp tiền, Rút tiền, Đáo Hạn Dự Án...) và "note" (diễn giải chi tiết) -
-- vì cột không tồn tại, dữ liệu này bị Postgres âm thầm bỏ qua, khiến các
-- điều kiện kiểm tra dựa vào "category" (vd. chống lặp trả lãi/đáo hạn) không
-- hoạt động đúng khi đọc lại từ Supabase.
-- ============================================================================

ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS note TEXT;

-- Kiểm tra sau khi chạy:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'wallet_transactions'
--   order by column_name;
-- Phải thấy "category" và "note" trong danh sách.
