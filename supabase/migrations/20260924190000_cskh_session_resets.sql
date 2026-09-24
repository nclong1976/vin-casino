-- Cho phép Admin (MessagesTab.jsx) chủ động "Bắt đầu cuộc trò chuyện mới"
-- cho 1 khách - đúng hiệu ứng như khi khách tự rời trang CSKH quá
-- CSKH_AWAY_THRESHOLD_MS (cskhConversation.js): conversation_id rotate sang
-- id mới, khách không còn thấy lại lịch sử cuộc trò chuyện trước đó (vẫn
-- nguyên vẹn cho Admin tra cứu), chỉ khác là do Admin chủ động kích hoạt
-- NGAY thay vì khách tự rời trang.
--
-- Cơ chế rotate hiện có hoàn toàn ở localStorage PHÍA TRÌNH DUYỆT KHÁCH -
-- Admin không có cách nào tác động trực tiếp vào đó. Bảng này là tín hiệu
-- phía SERVER để trình duyệt khách (đang mở CSKH, hoặc lần mở kế tiếp) tự
-- đọc/subscribe rồi áp dụng - đúng mẫu kiến trúc app_maintenance_config/
-- casino_maintenance_config (1 dòng theo key, Realtime, RLS admin-ghi/
-- khách-đọc-của-chính-mình).
CREATE TABLE public.cskh_session_resets (
  user_id text PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text
);

ALTER TABLE public.cskh_session_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY cskh_session_resets_select_own_or_admin
  ON public.cskh_session_resets FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())::text OR is_admin()) AND NOT is_anon_session());

CREATE POLICY cskh_session_resets_admin_write
  ON public.cskh_session_resets FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

ALTER PUBLICATION supabase_realtime ADD TABLE public.cskh_session_resets;
