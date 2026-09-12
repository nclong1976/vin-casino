-- SỰ CỐ NGHIÊM TRỌNG ĐANG DIỄN RA: 4 policy RLS trên bảng "users"
-- (users_select_own_or_admin/insert/update/delete_own_or_admin) tự kiểm tra
-- quyền admin bằng 1 subquery lồng "EXISTS (SELECT 1 FROM users a WHERE
-- a.id = auth.uid() AND a.role = 'admin')" - subquery này lại TỰ query
-- chính bảng "users", nên Postgres phải áp policy RLS của "users" một lần
-- nữa để lọc subquery đó, và policy đó lại chứa đúng subquery y hệt -> đệ
-- quy vô hạn. Postgres phát hiện và chặn bằng lỗi 42P17 "infinite recursion
-- detected in policy for relation users".
--
-- Lỗi này không chỉ chặn riêng bảng users - MỌI bảng khác có policy gọi
-- is_admin() (dự án, giao dịch, tin tức, casino_secure_config...) cũng đều
-- FAIL theo vì is_admin() bên trong đọc bảng users, và ngay cả khi
-- is_admin() không được gọi, PostgREST vẫn cần xác thực auth.uid() qua JWT
-- claims chạm tới users trong một số đường - kết quả quan sát thực tế qua
-- log: /users, /transactions, /investment_projects, /news,
-- /casino_secure_config đều trả 500 y hệt lỗi 42P17 cùng lúc.
--
-- is_admin() (xem migration harden_role_escalation_guard) đã tồn tại sẵn,
-- SECURITY DEFINER nên đọc bảng users KHÔNG bị áp lại RLS (chạy dưới quyền
-- chủ sở hữu hàm, có BYPASSRLS) - dùng thẳng nó thay cho subquery tự lồng,
-- giữ nguyên đúng ngữ nghĩa "chủ sở hữu dòng HOẶC admin" của 4 policy này.
drop policy if exists "users_select_own_or_admin" on public.users;
create policy "users_select_own_or_admin" on public.users
  for select
  to authenticated
  using (id = auth.uid()::text or public.is_admin());

drop policy if exists "users_insert_own_or_admin" on public.users;
create policy "users_insert_own_or_admin" on public.users
  for insert
  to authenticated
  with check (id = auth.uid()::text or public.is_admin());

drop policy if exists "users_update_own_or_admin" on public.users;
create policy "users_update_own_or_admin" on public.users
  for update
  to authenticated
  using (id = auth.uid()::text or public.is_admin())
  with check (id = auth.uid()::text or public.is_admin());

drop policy if exists "users_delete_own_or_admin" on public.users;
create policy "users_delete_own_or_admin" on public.users
  for delete
  to authenticated
  using (id = auth.uid()::text or public.is_admin());
