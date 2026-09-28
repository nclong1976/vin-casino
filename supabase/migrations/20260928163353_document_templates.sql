-- Giai đoạn 1 của thiết kế "E-Contract & Document e-Signing": Admin tự tạo
-- mẫu tài liệu (Template) tái sử dụng thay vì phải gõ tay toàn bộ nội dung
-- mỗi lần gửi cho khách. body chứa placeholder dạng {{BIEN}} sẽ được thay
-- thế bằng variables_values khi Admin khởi tạo 1 document từ mẫu (xem cột
-- mới template_id/variables_values thêm vào custom_documents bên dưới).
-- Không đụng tới luồng "soạn tự do" (template_id NULL) hiện có.
CREATE TABLE public.document_templates (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft | published | archived
  version integer NOT NULL DEFAULT 1,
  created_by text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_templates_status ON public.document_templates USING btree (status);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- Chỉ Admin thấy/thao tác mẫu - khách không cần và không nên nhìn thấy
-- danh sách mẫu thô (chứa placeholder chưa điền).
CREATE POLICY document_templates_select_admin
  ON public.document_templates FOR SELECT TO authenticated
  USING (is_admin() AND NOT is_anon_session());

CREATE POLICY document_templates_insert_admin
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (is_admin() AND NOT is_anon_session());

CREATE POLICY document_templates_update_admin
  ON public.document_templates FOR UPDATE TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

CREATE POLICY document_templates_delete_admin
  ON public.document_templates FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_anon_session());

ALTER PUBLICATION supabase_realtime ADD TABLE public.document_templates;

-- Mở rộng custom_documents để liên kết ngược tới mẫu đã dùng (nullable -
-- giữ nguyên đường "soạn tự do" không qua mẫu như hiện tại).
ALTER TABLE public.custom_documents
  ADD COLUMN template_id text REFERENCES public.document_templates(id),
  ADD COLUMN variables_values jsonb NOT NULL DEFAULT '{}'::jsonb;
