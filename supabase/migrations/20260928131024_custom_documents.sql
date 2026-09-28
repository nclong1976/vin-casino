-- Cho phép Admin soạn 1 hợp đồng/giấy tờ TÙY Ý (không gắn với 1 giao dịch
-- đầu tư nào) gửi cho 1 khách hàng cụ thể, khách tự mở và ký chữ ký điện tử
-- ngay trong app - khác hẳn "signature_content" trên transactions (chỉ tự
-- sinh SẴN theo đúng 1 mẫu hợp đồng đầu tư cố định, xem ContractDocument.jsx).
CREATE TABLE public.custom_documents (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  document_type text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- pending (chờ khách ký) -> signed (đã ký, chờ admin duyệt) -> approved / rejected
  signature_type text,
  signature_content text,
  signed_at timestamptz,
  created_by text,
  created_date timestamptz NOT NULL DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_custom_documents_user ON public.custom_documents USING btree (user_id);
CREATE INDEX idx_custom_documents_status ON public.custom_documents USING btree (status);

ALTER TABLE public.custom_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_documents_select_own_or_admin
  ON public.custom_documents FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())::text OR is_admin()) AND NOT is_anon_session());

CREATE POLICY custom_documents_insert_admin_only
  ON public.custom_documents FOR INSERT TO authenticated
  WITH CHECK (is_admin() AND NOT is_anon_session());

CREATE POLICY custom_documents_update_own_or_admin
  ON public.custom_documents FOR UPDATE TO authenticated
  USING ((user_id = (SELECT auth.uid())::text OR is_admin()) AND NOT is_anon_session())
  WITH CHECK ((user_id = (SELECT auth.uid())::text OR is_admin()) AND NOT is_anon_session());

CREATE POLICY custom_documents_delete_admin_only
  ON public.custom_documents FOR DELETE TO authenticated
  USING (is_admin() AND NOT is_anon_session());

-- RLS ở trên cho phép khách UPDATE đúng dòng của mình (để họ tự ghi chữ ký),
-- nhưng KHÔNG tự giới hạn được CỘT nào họ được sửa - nếu không có trigger
-- này, khách có thể tự sửa thẳng title/content/status/document_type của
-- chính "hợp đồng" mình đang xem (vd tự đổi status thành "approved" mà
-- không cần Admin duyệt, hoặc tự sửa nội dung hợp đồng đã ký). Theo đúng
-- mẫu "allow-list" đã dùng cho messages (protect_message_identity_fields,
-- xem migration fix_message_update_denylist_to_allowlist) - khoá lại TOÀN
-- BỘ cột khi người sửa không phải admin, chỉ mở lại đúng 3 cột chữ ký, và
-- chỉ khi hợp đồng CHƯA ký (status='pending') - ký xong không tự sửa lại
-- được nữa. Trạng thái "signed" do chính trigger này tự suy ra từ việc có
-- chữ ký hay không, không tin thẳng giá trị status client gửi lên.
CREATE OR REPLACE FUNCTION public.protect_custom_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_signature_type text;
  v_signature_content text;
  v_signed_at timestamptz;
begin
  if not public.is_admin() then
    v_signature_type := new.signature_type;
    v_signature_content := new.signature_content;
    v_signed_at := new.signed_at;
    new := old;
    if old.status = 'pending' and v_signature_content is not null and v_signature_content <> '' then
      new.signature_type := v_signature_type;
      new.signature_content := v_signature_content;
      new.signed_at := coalesce(v_signed_at, now());
      new.status := 'signed';
    end if;
  end if;
  return new;
end;
$function$;

CREATE TRIGGER protect_custom_document_fields_trigger
  BEFORE UPDATE ON public.custom_documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_custom_document_fields();

ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_documents;
