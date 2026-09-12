-- ProjectsTab.jsx đã có UI "Tự động MỞ/TẮT lúc" (scheduled_open_at/
-- scheduled_close_at) và projectScheduler.js đã tự rà soát để bật/tắt
-- is_active đúng giờ hẹn từ lâu, nhưng 2 cột này CHƯA từng tồn tại thật
-- trong bảng - client ghi/đọc y hệt tên cột này ở top-level object, nên
-- ENTITY_COLUMNS.Project (supabaseDb.js) không liệt kê chúng khiến giá trị
-- bị lặng lẽ rơi vào cột "extra" jsonb lúc ghi, nhưng KHÔNG NƠI NÀO đọc lại
-- từ "extra" - nghĩa là hẹn giờ lưu xong sẽ biến mất ngay khi tải lại trang,
-- và projectScheduler.js không bao giờ thấy giá trị để tự động bật/tắt.
-- Thêm cột thật để toàn bộ luồng đọc/ghi sẵn có hoạt động đúng như thiết kế.
ALTER TABLE public.investment_projects
  ADD COLUMN IF NOT EXISTS scheduled_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_close_at timestamptz;

COMMENT ON COLUMN public.investment_projects.scheduled_open_at IS 'Thời điểm tự động bật is_active=true (do projectScheduler.js rà soát định kỳ). NULL = không hẹn giờ mở.';
COMMENT ON COLUMN public.investment_projects.scheduled_close_at IS 'Thời điểm tự động tắt is_active=false (do projectScheduler.js rà soát định kỳ). NULL = không hẹn giờ đóng.';
