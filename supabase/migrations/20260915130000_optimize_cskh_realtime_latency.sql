-- Giảm độ trễ CSKH (cả 2 luồng khách<->admin): tối ưu policy RLS trên
-- messages/support_conversations theo đúng khuyến nghị của Supabase
-- Advisor (auth_rls_initplan) - auth.uid()/is_admin() gọi trực tiếp trong
-- policy bị Postgres RE-EVALUATE cho TỪNG DÒNG thay vì 1 lần/câu lệnh. Bọc
-- trong (select ...) biến nó thành InitPlan (tính 1 lần, cache lại) - không
-- đổi Ý NGHĨA của bất kỳ policy nào, chỉ đổi CÁCH Postgres thực thi. Việc
-- này ảnh hưởng trực tiếp tới tốc độ Realtime: mỗi tin nhắn mới, Supabase
-- Realtime phải chạy lại đúng policy SELECT này cho MỌI subscriber đang mở
-- kênh để quyết định có được phép nhận tin hay không - policy càng rẻ,
-- tin nhắn càng tới nhanh.

alter policy messages_insert_own_or_admin on public.messages
  with check ((((select auth.uid())::text = user_id) and (sender = 'user'::text)) or (select is_admin()));

alter policy messages_delete_admin_only on public.messages
  using ((select is_admin()));

alter policy messages_select_own_or_admin on public.messages
  using (((select auth.uid())::text = user_id) or (select is_admin()));

alter policy messages_update_own_or_admin on public.messages
  using (((select auth.uid())::text = user_id) or (select is_admin()))
  with check (((select auth.uid())::text = user_id) or (select is_admin()));

alter policy support_conversations_select_own_or_admin on public.support_conversations
  using (((select auth.uid())::text = user_id) or ((select auth.uid())::text = id) or (select is_admin()));

alter policy support_conversations_write_admin_only on public.support_conversations
  using ((select is_admin()))
  with check ((select is_admin()));

-- Bỏ 2 index thừa trên messages: mỗi lần gửi tin (INSERT), Postgres phải
-- cập nhật TẤT CẢ index của bảng trước khi coi là ghi xong - càng ít index
-- thừa, ghi càng nhanh, không đổi kết quả truy vấn nào.
-- messages_thread_id_created_at_idx: TRÙNG HỆT messages_thread_created_at_idx
-- (cùng definition (thread_id, created_at)) - Supabase Advisor xác nhận là
-- duplicate_index. Giữ lại 1 cái.
drop index if exists public.messages_thread_id_created_at_idx;
-- idx_messages_conversation: chỉ mục đơn (conversation_id) đã bị bao trọn
-- bởi messages_conversation_created_idx (conversation_id, created_date DESC)
-- - mọi truy vấn WHERE conversation_id=... vẫn dùng được index kép này.
drop index if exists public.idx_messages_conversation;
