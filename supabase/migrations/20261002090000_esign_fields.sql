-- Ký văn bản - trường ký nhiều loại + bắt buộc đọc hết (spec hợp đồng v3.1,
-- docs/design/contract-management-spec.md mục 2.2, 3.2, 4.5, 5.2).
--
-- - custom_documents.field_values: giá trị người nhận điền vào các trường của
--   mẫu (layout_snapshot.fields): ảnh ký nháy/chữ ký phụ (đường dẫn trong
--   bucket signed-documents), ô xác nhận, ô nhập, ngày ký. Vị trí trường
--   không cần lưu: bộ dàn trang tính lại từ snapshot (kết quả xác định).
-- - custom_documents.read_completed_at: người nhận đã cuộn hết văn bản.
-- - mark_document_read(): người nhận ghi mốc đã đọc hết (1 lần).
-- - esign_record_signature(..., p_field_values): bản mới, bắt buộc đã đọc
--   hết và ghi kèm giá trị trường. Bản 9 tham số cũ giữ lại cho tới khi
--   Edge Function sign-document mới được triển khai.

ALTER TABLE public.custom_documents
  ADD COLUMN IF NOT EXISTS field_values jsonb,
  ADD COLUMN IF NOT EXISTS read_completed_at timestamptz;

-- ─── 1) Khoá thêm 2 cột mới ───────────────────────────────────────────────
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
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('esign.trusted_write', true) = 'on'
     or (session_user in ('postgres', 'supabase_admin') and coalesce(auth.role(), '') = '') then
    if old.locked_at is not null and (
         new.rendered_model      is distinct from old.rendered_model or
         new.content_sha256      is distinct from old.content_sha256 or
         new.letterhead_snapshot is distinct from old.letterhead_snapshot or
         new.layout_snapshot     is distinct from old.layout_snapshot or
         new.slot_boxes          is distinct from old.slot_boxes or
         new.title               is distinct from old.title or
         new.content             is distinct from old.content or
         new.doc_no              is distinct from old.doc_no or
         new.user_id             is distinct from old.user_id or
         new.signature_content   is distinct from old.signature_content or
         new.signature_path      is distinct from old.signature_path or
         new.signed_at           is distinct from old.signed_at or
         new.signer_name         is distinct from old.signer_name or
         new.field_values        is distinct from old.field_values) then
      raise exception 'document % is locked', old.id using errcode = '42501';
    end if;
    return new;
  end if;

  if public.is_admin() then
    if old.rendered_model is not null then
      new.title := old.title;
      new.content := old.content;
      new.rendered_model := old.rendered_model;
      new.content_sha256 := old.content_sha256;
      new.letterhead_snapshot := old.letterhead_snapshot;
      new.layout_snapshot := old.layout_snapshot;
      new.slot_boxes := old.slot_boxes;
      new.doc_no := old.doc_no;
      new.user_id := old.user_id;
      new.campaign_id := old.campaign_id;
      new.signature_type := old.signature_type;
      new.signature_content := old.signature_content;
      new.signature_path := old.signature_path;
      new.signature_method := old.signature_method;
      new.signature_meta := old.signature_meta;
      new.signer_name := old.signer_name;
      new.signed_at := old.signed_at;
      new.signed_ip := old.signed_ip;
      new.signed_user_agent := old.signed_user_agent;
      new.consent_text := old.consent_text;
      new.locked_at := old.locked_at;
      new.first_viewed_at := old.first_viewed_at;
      new.read_completed_at := old.read_completed_at;
      new.field_values := old.field_values;
      new.pdf_status := old.pdf_status;
      new.pdf_path := old.pdf_path;
      new.pdf_sha256 := old.pdf_sha256;
      new.pdf_generated_at := old.pdf_generated_at;
      new.pdf_expires_at := old.pdf_expires_at;
    end if;
    return new;
  end if;

  if old.rendered_model is not null then
    return old;
  end if;

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
  return new;
end;
$function$;

-- ─── 2) Người nhận đã cuộn hết văn bản ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_document_read(p_document_id text, p_pages_seen integer DEFAULT NULL, p_duration_ms integer DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_doc public.custom_documents;
begin
  if public.is_anon_session() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_doc from public.custom_documents
   where id = p_document_id and user_id = (select auth.uid())::text
   for update;
  if not found then
    return null;
  end if;
  if v_doc.read_completed_at is null then
    perform set_config('esign.trusted_write', 'on', true);
    update public.custom_documents
       set read_completed_at = now(),
           first_viewed_at = coalesce(first_viewed_at, now())
     where id = p_document_id;
    perform set_config('esign.trusted_write', 'off', true);
    insert into public.document_events (document_id, event, actor_id, data)
    values (p_document_id, 'read_completed', auth.uid()::text,
            jsonb_strip_nulls(jsonb_build_object('pages_seen', p_pages_seen, 'duration_ms', greatest(p_duration_ms, 0))));
    return now();
  end if;
  return v_doc.read_completed_at;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_document_read(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_document_read(text, integer, integer) TO authenticated;

-- ─── 3) Ghi chữ ký + giá trị trường (chỉ Edge Function sign-document) ─────
CREATE OR REPLACE FUNCTION public.esign_record_signature(
  p_document_id text,
  p_user_id text,
  p_method text,
  p_signature_content text,
  p_signature_path text,
  p_signature_meta jsonb,
  p_ip text,
  p_user_agent text,
  p_consent_text text,
  p_field_values jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_doc public.custom_documents;
  v_signer text;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_fields jsonb := coalesce(p_field_values, '{}'::jsonb);
  k text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_doc from public.custom_documents where id = p_document_id and user_id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if v_doc.rendered_model is null then raise exception 'NOT_ESIGN_DOCUMENT' using errcode = '22023'; end if;
  if v_doc.status = 'revoked' then raise exception 'REVOKED' using errcode = '22023'; end if;
  if v_doc.status = 'expired' or (v_doc.due_at is not null and v_doc.due_at < v_now) then raise exception 'EXPIRED' using errcode = '22023'; end if;
  if v_doc.status <> 'pending' or v_doc.locked_at is not null then raise exception 'ALREADY_SIGNED' using errcode = '22023'; end if;
  if v_doc.read_completed_at is null then raise exception 'READ_REQUIRED' using errcode = '22023'; end if;

  -- Ngày ký do server điền.
  for k in select key from jsonb_each(v_fields) loop
    if v_fields -> k ->> 'type' = 'date' then
      v_fields := jsonb_set(v_fields, array[k, 'value_text'], to_jsonb(to_char(v_now at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')));
    end if;
  end loop;

  select nullif(btrim(coalesce(u.full_name, u.name, '')), '') into v_signer from public.users u where u.id = p_user_id;
  v_expires := case when coalesce(v_doc.retention_days, 0) = 0 then null else v_now + make_interval(days => v_doc.retention_days) end;

  update public.custom_documents set
    signature_type = case when p_method = 'acknowledge' then 'acknowledge' else 'draw' end,
    signature_content = p_signature_content,
    signature_path = p_signature_path,
    signature_method = p_method,
    signature_meta = coalesce(p_signature_meta, '{}'::jsonb),
    field_values = v_fields,
    signer_name = coalesce(v_signer, 'Người nhận'),
    signed_at = v_now,
    locked_at = v_now,
    status = 'signed',
    signed_ip = p_ip,
    signed_user_agent = left(p_user_agent, 500),
    consent_text = p_consent_text,
    pdf_status = 'queued',
    pdf_expires_at = v_expires
  where id = p_document_id;

  insert into public.document_events (document_id, event, actor_id, ip, user_agent, data)
  values (p_document_id, 'signed', p_user_id, p_ip, left(p_user_agent, 500),
          jsonb_build_object('method', p_method, 'fields', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_object_keys(v_fields) key)));

  insert into public.pdf_jobs (document_id, status, attempts, updated_at)
  values (p_document_id, 'queued', 0, v_now)
  on conflict (document_id) do update set status = 'queued', attempts = 0, last_error = null, updated_at = v_now;

  return jsonb_build_object(
    'document_id', p_document_id,
    'status', 'signed',
    'signer_name', coalesce(v_signer, 'Người nhận'),
    'signed_at', v_now,
    'pdf_status', 'queued',
    'pdf_expires_at', v_expires,
    'field_values', v_fields
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_record_signature(text, text, text, text, text, jsonb, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_record_signature(text, text, text, text, text, jsonb, text, text, text, jsonb) TO service_role;
