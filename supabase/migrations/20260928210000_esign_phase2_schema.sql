-- Giai đoạn 2 "Quản lý & Ký văn bản điện tử" - Sprint 1 / T1: nền tảng
-- schema (xem docs/design/e-sign-letterhead-spec.md mục 4). Migration này
-- CHỈ thêm bảng/cột/bucket mới, KHÔNG đổi trigger
-- protect_custom_document_fields - luồng ký hiện tại của pages/Document.jsx
-- vẫn chạy nguyên như cũ. Trigger sẽ được siết lại ở T16, phát hành cùng
-- Edge Function sign-document.

-- ─── 1) Khung văn bản chung (Header thương hiệu + Quốc hiệu + Footer) ─────
CREATE TABLE public.document_letterheads (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  header jsonb NOT NULL DEFAULT '{}'::jsonb,
  footer jsonb NOT NULL DEFAULT '{}'::jsonb,
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version integer NOT NULL DEFAULT 1,
  created_by text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- Đúng 1 khung mặc định trong toàn hệ thống.
CREATE UNIQUE INDEX uq_document_letterheads_default
  ON public.document_letterheads (is_default) WHERE is_default;

ALTER TABLE public.document_letterheads ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_letterheads_admin_all
  ON public.document_letterheads FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

-- Khung mặc định ban đầu - giữ đúng nội dung khung cứng đang có trong
-- CustomDocumentView.jsx (Quốc hiệu, con dấu Vinpearl, "Đại diện VinClub")
-- để các văn bản cũ chuyển sang renderer mới (T21) trông y như trước. Admin
-- bổ sung chữ ký đại diện trong màn Khung văn bản (T7).
INSERT INTO public.document_letterheads (id, name, is_default, header, footer, issuer, theme, status)
VALUES (
  'lh_default',
  'Khung chuẩn VinClub',
  true,
  '{"logo_url": null, "org_name": "VINCLUB", "org_sub": "", "show_national_motto": true, "doc_no_pattern": "VC/{{yyyy}}/{{seq}}", "place": "Hà Nội"}'::jsonb,
  '{"lines": ["VinClub"], "show_page_number": true, "show_hash": true, "show_qr": true}'::jsonb,
  '{"name": "Đại diện VinClub", "title": "Ban điều hành", "seal_url": "https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/0b8fe1b71_image-Photoroom8.png", "signature_url": null}'::jsonb,
  '{"primary": "#948154", "font_body": "Noto Serif", "font_size_pt": 13, "line_height": 1.4, "margins_mm": {"top": 20, "right": 15, "bottom": 25, "left": 20}}'::jsonb,
  'published'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2) Mở rộng mẫu tài liệu ────────────────────────────────────────────
-- body (plain-text, Giai đoạn 1) giữ nguyên; body_delta (Quill Delta) là
-- nguồn sự thật cho mẫu mới.
ALTER TABLE public.document_templates
  ADD COLUMN letterhead_id text REFERENCES public.document_letterheads(id),
  ADD COLUMN title_template text NOT NULL DEFAULT '',
  ADD COLUMN body_delta jsonb NOT NULL DEFAULT '{"ops": []}'::jsonb,
  ADD COLUMN layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN requires_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN retention_days integer CHECK (retention_days IS NULL OR retention_days > 0);

-- ─── 3) Nhóm người dùng lưu sẵn (tĩnh / động) ────────────────────────────
CREATE TABLE public.user_groups (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#948154',
  kind text NOT NULL DEFAULT 'static' CHECK (kind IN ('static', 'dynamic')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  created_by text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_group_members (
  group_id text NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  user_id  text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_user_group_members_user ON public.user_group_members USING btree (user_id);

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_groups_admin_all
  ON public.user_groups FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

CREATE POLICY user_group_members_admin_all
  ON public.user_group_members FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

-- member_count của nhóm tĩnh luôn khớp số dòng thật - tự đếm lại mỗi lần
-- thêm/xoá thành viên thay vì tin số client gửi lên.
CREATE OR REPLACE FUNCTION public.sync_user_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_group_id text := coalesce(new.group_id, old.group_id);
begin
  update public.user_groups g
     set member_count = (select count(*) from public.user_group_members m where m.group_id = v_group_id),
         updated_date = now()
   where g.id = v_group_id;
  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_user_group_member_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_user_group_member_count_trigger
  AFTER INSERT OR DELETE ON public.user_group_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_group_member_count();

-- ─── 4) Đợt phát hành ───────────────────────────────────────────────────
CREATE TABLE public.document_campaigns (
  id text PRIMARY KEY,
  template_id text NOT NULL REFERENCES public.document_templates(id),
  template_version integer NOT NULL,
  title text NOT NULL DEFAULT '',
  campaign_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience jsonb NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  retention_days integer CHECK (retention_days IS NULL OR retention_days > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'dispatching', 'sent', 'revoked')),
  dispatch_cursor text,
  scheduled_at timestamptz,
  created_by text,
  created_date timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);

CREATE INDEX idx_document_campaigns_status ON public.document_campaigns USING btree (status);

ALTER TABLE public.document_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_campaigns_admin_all
  ON public.document_campaigns FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

-- ─── 5) Mở rộng văn bản đã phát hành ────────────────────────────────────
-- Tất cả cột mới đều nullable hoặc có default → văn bản Giai đoạn 1 hiện có
-- (content plain-text, không có rendered_model) không bị ảnh hưởng.
ALTER TABLE public.custom_documents
  ADD COLUMN campaign_id text REFERENCES public.document_campaigns(id),
  ADD COLUMN letterhead_snapshot jsonb,
  ADD COLUMN layout_snapshot jsonb,
  ADD COLUMN rendered_model jsonb,
  ADD COLUMN slot_boxes jsonb,
  ADD COLUMN content_sha256 text,
  ADD COLUMN doc_no text UNIQUE,
  ADD COLUMN requires_signature boolean NOT NULL DEFAULT true,
  ADD COLUMN due_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN first_viewed_at timestamptz,
  ADD COLUMN signer_name text,
  ADD COLUMN signature_method text,
  ADD COLUMN signature_path text,
  ADD COLUMN signature_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN signed_ip text,
  ADD COLUMN signed_user_agent text,
  ADD COLUMN consent_text text,
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN pdf_status text NOT NULL DEFAULT 'none'
    CHECK (pdf_status IN ('none', 'queued', 'processing', 'ready', 'failed', 'purged')),
  ADD COLUMN pdf_path text,
  ADD COLUMN pdf_sha256 text,
  ADD COLUMN pdf_generated_at timestamptz,
  ADD COLUMN retention_days integer CHECK (retention_days IS NULL OR retention_days > 0),
  ADD COLUMN pdf_expires_at timestamptz,
  ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;

CREATE INDEX idx_custom_documents_campaign ON public.custom_documents USING btree (campaign_id);

-- Chống phát hành trùng: 1 người chỉ nhận 1 văn bản mỗi đợt (dispatch chạy
-- theo lô, có thể bị gọi lại giữa chừng).
CREATE UNIQUE INDEX uq_custom_documents_campaign_user
  ON public.custom_documents (campaign_id, user_id) WHERE campaign_id IS NOT NULL;

-- Job xoá PDF hết hạn lưu trữ chỉ quét đúng tập này.
CREATE INDEX idx_custom_documents_pdf_expiry
  ON public.custom_documents (pdf_expires_at)
  WHERE pdf_status = 'ready' AND NOT legal_hold;

-- Số văn bản tăng dần toàn hệ thống, dùng cho {{seq}} trong doc_no_pattern.
CREATE SEQUENCE public.document_no_seq;
REVOKE ALL ON SEQUENCE public.document_no_seq FROM PUBLIC, anon, authenticated;

-- ─── 6) Nhật ký văn bản (chỉ ghi thêm) ─────────────────────────────────
CREATE TABLE public.document_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id text NOT NULL REFERENCES public.custom_documents(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor_id text,
  ip text,
  user_agent text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_events_doc ON public.document_events USING btree (document_id, created_at);

ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;

-- Chỉ có policy SELECT: không ai ghi/sửa/xoá được qua PostgREST, chỉ
-- SECURITY DEFINER function hoặc service role (Edge Function) mới ghi.
CREATE POLICY document_events_select_own_or_admin
  ON public.document_events FOR SELECT TO authenticated
  USING (
    (is_admin() OR EXISTS (
      SELECT 1 FROM public.custom_documents d
       WHERE d.id = document_events.document_id
         AND d.user_id = (SELECT auth.uid())::text
    ))
    AND NOT is_anon_session()
  );

-- ─── 7) Cấu hình văn bản (1 dòng, admin-only) ───────────────────────────
-- Cùng mẫu với app_maintenance_config nhưng KHÔNG cho user thường đọc.
-- default_retention_days = 365: lưu trữ PDF mặc định 1 năm (quyết định D6).
CREATE TABLE public.document_settings (
  id text PRIMARY KEY DEFAULT 'default',
  config jsonb NOT NULL DEFAULT '{"default_retention_days": 365, "purge_notice_days": 7}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.document_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_settings_admin_all
  ON public.document_settings FOR ALL TO authenticated
  USING (is_admin() AND NOT is_anon_session())
  WITH CHECK (is_admin() AND NOT is_anon_session());

-- ─── 8) Hàng đợi tạo PDF (chỉ service role) ─────────────────────────────
CREATE TABLE public.pdf_jobs (
  document_id text PRIMARY KEY REFERENCES public.custom_documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_jobs_status ON public.pdf_jobs USING btree (status, updated_at);

-- RLS bật nhưng không có policy nào → authenticated/anon không thấy gì.
ALTER TABLE public.pdf_jobs ENABLE ROW LEVEL SECURITY;

-- ─── 9) Storage ─────────────────────────────────────────────────────────
-- doc-assets: logo, con dấu, chữ ký đại diện, font - public để renderer
-- trên web tải thẳng; chỉ Admin được ghi.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('doc-assets', 'doc-assets', true, 5242880, array['image/*', 'font/*'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY doc_assets_insert_admin
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doc-assets' AND is_admin() AND NOT is_anon_session());

CREATE POLICY doc_assets_update_admin
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'doc-assets' AND is_admin() AND NOT is_anon_session())
  WITH CHECK (bucket_id = 'doc-assets' AND is_admin() AND NOT is_anon_session());

CREATE POLICY doc_assets_delete_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doc-assets' AND is_admin() AND NOT is_anon_session());

-- signed-documents: PDF đã ký + PNG chữ ký. Private, KHÔNG có policy nào
-- cho authenticated - chỉ Edge Function (service role) đọc/ghi, người dùng
-- tải qua signed URL ngắn hạn.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signed-documents', 'signed-documents', false, 20971520, array['application/pdf', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- ─── 10) Realtime cho các màn Admin ─────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_letterheads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_groups;
