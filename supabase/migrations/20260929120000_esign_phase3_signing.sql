-- Giai đoạn 2 "Ký văn bản điện tử" - Sprint 3 (T13, T15, T16, T17): ký qua
-- Edge Function, khoá văn bản, hàng đợi tạo PDF, đánh dấu đã xem, trang
-- kiểm tra công khai. Xem docs/design/e-sign-letterhead-spec.md mục 4.11,
-- 8.3, 8.4, 8.5.

-- ─── 1) Trigger bảo vệ văn bản ────────────────────────────────────────────
-- Văn bản Giai đoạn 2 (có rendered_model): người dùng KHÔNG tự ghi được cột
-- nào - ký qua Edge Function sign-document (service role), đánh dấu đã xem
-- qua RPC mark_document_viewed. Văn bản Giai đoạn 1 (chỉ có content) giữ
-- nguyên cách ký cũ. Nội dung đã khoá thì kể cả admin/service role cũng
-- không sửa được; admin không giả mạo được thông tin chữ ký.
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
  -- Nguồn tin cậy: Edge Function (service role), RPC nội bộ đã tự kiểm tra
  -- quyền (esign.trusted_write), và tác vụ chạy thẳng bằng postgres không
  -- qua PostgREST (pg_cron, migration). Vẫn không được sửa nội dung đã khoá.
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
         new.signer_name         is distinct from old.signer_name) then
      raise exception 'document % is locked', old.id using errcode = '42501';
    end if;
    return new;
  end if;

  if public.is_admin() then
    if old.rendered_model is not null then
      -- Văn bản đã phát hành: admin chỉ đổi trạng thái (duyệt/từ chối/thu hồi),
      -- lưu trữ, giữ pháp lý. Mọi trường nội dung/chữ ký giữ nguyên - im lặng
      -- bỏ qua thay vì báo lỗi để thao tác duyệt vẫn thành công.
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
      new.pdf_status := old.pdf_status;
      new.pdf_path := old.pdf_path;
      new.pdf_sha256 := old.pdf_sha256;
      new.pdf_generated_at := old.pdf_generated_at;
      new.pdf_expires_at := old.pdf_expires_at; -- đổi qua RPC set_document_retention
    end if;
    return new;
  end if;

  -- Người dùng thường.
  if old.rendered_model is not null then
    return old;
  end if;

  -- Văn bản Giai đoạn 1: chỉ ghi được 3 cột chữ ký khi còn 'pending'.
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

-- ─── 2) Đánh dấu đã xem ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_document_viewed(p_document_id text)
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
    return null; -- không phải văn bản của mình (admin xem không tính là "đã xem")
  end if;
  if v_doc.first_viewed_at is null then
    perform set_config('esign.trusted_write', 'on', true);
    update public.custom_documents set first_viewed_at = now() where id = p_document_id;
    perform set_config('esign.trusted_write', 'off', true);
    insert into public.document_events (document_id, event, actor_id) values (p_document_id, 'viewed', auth.uid()::text);
    return now();
  end if;
  return v_doc.first_viewed_at;
end;
$function$;

-- ─── 3) Ghi chữ ký (chỉ Edge Function sign-document) ──────────────────────
-- Thời điểm ký, tên người ký, hạn lưu trữ do server quyết định. Lỗi trả về
-- bằng mã trong message để Edge Function đổi sang HTTP 409.
CREATE OR REPLACE FUNCTION public.esign_record_signature(
  p_document_id text,
  p_user_id text,
  p_method text,
  p_signature_content text,
  p_signature_path text,
  p_signature_meta jsonb,
  p_ip text,
  p_user_agent text,
  p_consent_text text
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

  select nullif(btrim(coalesce(u.full_name, u.name, '')), '') into v_signer from public.users u where u.id = p_user_id;
  v_expires := case when coalesce(v_doc.retention_days, 0) = 0 then null else v_now + make_interval(days => v_doc.retention_days) end;

  update public.custom_documents set
    signature_type = case when p_method = 'acknowledge' then 'acknowledge' else 'draw' end,
    signature_content = p_signature_content,
    signature_path = p_signature_path,
    signature_method = p_method,
    signature_meta = coalesce(p_signature_meta, '{}'::jsonb),
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
  values (p_document_id, 'signed', p_user_id, p_ip, left(p_user_agent, 500), jsonb_build_object('method', p_method));

  insert into public.pdf_jobs (document_id, status, attempts, updated_at)
  values (p_document_id, 'queued', 0, v_now)
  on conflict (document_id) do update set status = 'queued', attempts = 0, last_error = null, updated_at = v_now;

  return jsonb_build_object(
    'document_id', p_document_id,
    'status', 'signed',
    'signer_name', coalesce(v_signer, 'Người nhận'),
    'signed_at', v_now,
    'pdf_status', 'queued',
    'pdf_expires_at', v_expires
  );
end;
$function$;

-- ─── 4) Hàng đợi tạo PDF (chỉ Edge Function render-document-pdf) ─────────
CREATE OR REPLACE FUNCTION public.esign_claim_pdf_job(p_document_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.pdf_jobs
     set status = 'processing', attempts = attempts + 1, updated_at = now()
   where document_id = p_document_id
     and ((status in ('queued', 'failed') and attempts < 5)
          or (status = 'processing' and updated_at < now() - interval '5 minutes'))
  returning attempts into v_attempts;
  if v_attempts is null then return null; end if;
  update public.custom_documents set pdf_status = 'processing' where id = p_document_id;
  return v_attempts;
end;
$function$;

CREATE OR REPLACE FUNCTION public.esign_finish_pdf_job(p_document_id text, p_path text, p_sha256 text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.custom_documents
     set pdf_status = 'ready', pdf_path = p_path, pdf_sha256 = p_sha256, pdf_generated_at = now()
   where id = p_document_id;
  update public.pdf_jobs set status = 'done', last_error = null, updated_at = now() where document_id = p_document_id;
  insert into public.document_events (document_id, event, actor_id, data)
  values (p_document_id, 'pdf_ready', 'system', jsonb_build_object('sha256', p_sha256));
end;
$function$;

CREATE OR REPLACE FUNCTION public.esign_fail_pdf_job(p_document_id text, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.pdf_jobs set status = 'failed', last_error = left(p_error, 2000), updated_at = now()
   where document_id = p_document_id
  returning attempts into v_attempts;
  update public.custom_documents
     set pdf_status = case when coalesce(v_attempts, 0) >= 5 then 'failed' else 'queued' end
   where id = p_document_id;
  if coalesce(v_attempts, 0) >= 5 then
    insert into public.document_events (document_id, event, actor_id, data)
    values (p_document_id, 'pdf_failed', 'system', jsonb_build_object('error', left(p_error, 500)));
  end if;
end;
$function$;

-- Admin bấm "Tạo lại PDF" cho văn bản đã ký bị lỗi.
CREATE OR REPLACE FUNCTION public.esign_requeue_pdf(p_document_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  insert into public.pdf_jobs (document_id, status, attempts, updated_at)
  select id, 'queued', 0, now() - interval '3 minutes' from public.custom_documents
   where id = p_document_id and signed_at is not null and pdf_status in ('failed', 'none')
  on conflict (document_id) do update set status = 'queued', attempts = 0, last_error = null, updated_at = now() - interval '3 minutes';
  perform set_config('esign.trusted_write', 'on', true);
  update public.custom_documents set pdf_status = 'queued' where id = p_document_id and signed_at is not null and pdf_status in ('failed', 'none');
  perform set_config('esign.trusted_write', 'off', true);
end;
$function$;

-- Định nghĩa lại (Sprint 2) để ghi pdf_expires_at qua cờ esign.trusted_write,
-- vì trigger ở mục 1 giờ giữ nguyên cột này khi admin UPDATE trực tiếp.
CREATE OR REPLACE FUNCTION public.set_document_retention(p_document_id text, p_retention_days integer, p_legal_hold boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_old public.custom_documents;
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_retention_days is not null and p_retention_days < 0 then
    raise exception 'retention_days phải >= 0' using errcode = '22023';
  end if;
  select * into v_old from public.custom_documents where id = p_document_id for update;
  if not found then
    raise exception 'Không tìm thấy văn bản' using errcode = 'P0002';
  end if;

  perform set_config('esign.trusted_write', 'on', true);
  update public.custom_documents d
     set retention_days = coalesce(p_retention_days, d.retention_days),
         pdf_expires_at = case
           when d.signed_at is null then null
           when coalesce(p_retention_days, d.retention_days, 0) = 0 then null
           else d.signed_at + make_interval(days => coalesce(p_retention_days, d.retention_days))
         end,
         legal_hold = coalesce(p_legal_hold, d.legal_hold)
   where d.id = p_document_id;
  perform set_config('esign.trusted_write', 'off', true);

  if p_retention_days is not null and p_retention_days is distinct from v_old.retention_days then
    insert into public.document_events (document_id, event, actor_id, data)
    values (p_document_id, 'retention_changed', auth.uid()::text, jsonb_build_object('from', v_old.retention_days, 'to', p_retention_days));
  end if;
  if p_legal_hold is not null and p_legal_hold is distinct from v_old.legal_hold then
    insert into public.document_events (document_id, event, actor_id)
    values (p_document_id, case when p_legal_hold then 'legal_hold_set' else 'legal_hold_released' end, auth.uid()::text);
  end if;
end;
$function$;

-- ─── 5) Kiểm tra công khai (trang /verify) ────────────────────────────────
-- Không lộ nội dung: chỉ trả tồn tại / trạng thái / ngày ký / đơn vị phát
-- hành và (nếu gửi kèm) hash có khớp bản gốc hay không.
CREATE OR REPLACE FUNCTION public.verify_document(p_doc_no text, p_sha256 text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_doc public.custom_documents;
  v_hash text := lower(nullif(btrim(coalesce(p_sha256, '')), ''));
begin
  select * into v_doc from public.custom_documents
   where doc_no = btrim(p_doc_no) and rendered_model is not null
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'doc_no', v_doc.doc_no,
    'status', v_doc.status,
    'issued_at', v_doc.created_date,
    'signed', v_doc.signed_at is not null,
    'signed_at', v_doc.signed_at,
    'issuer_org', v_doc.letterhead_snapshot->'header'->>'org_name',
    'pdf_available', v_doc.pdf_status = 'ready',
    'hash_checked', v_hash is not null,
    'pdf_match', v_hash is not null and v_hash = lower(coalesce(v_doc.pdf_sha256, '')),
    'content_match', v_hash is not null and v_hash = lower(coalesce(v_doc.content_sha256, ''))
  );
end;
$function$;

-- ─── 6) Quyền gọi ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.mark_document_viewed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_document_viewed(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.esign_record_signature(text, text, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_record_signature(text, text, text, text, text, jsonb, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esign_claim_pdf_job(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_claim_pdf_job(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esign_finish_pdf_job(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_finish_pdf_job(text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esign_fail_pdf_job(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_fail_pdf_job(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esign_requeue_pdf(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esign_requeue_pdf(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_document(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_document(text, text) TO anon, authenticated, service_role;

-- ─── 7) Chạy lại job PDF bị lỗi / treo (pg_cron → Edge Function) ──────────
-- Dùng cùng 2 secret Vault với esign_kick_campaigns (xem migration Sprint 2).
CREATE OR REPLACE FUNCTION public.esign_kick_pdf_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_base text;
  v_secret text;
  v_count integer := 0;
  j record;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'esign_functions_base_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'esign_internal_secret' limit 1;
  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    return 0;
  end if;
  for j in
    select document_id from public.pdf_jobs
     where (status in ('queued', 'failed') and attempts < 5 and updated_at < now() - interval '2 minutes')
        or (status = 'processing' and updated_at < now() - interval '5 minutes')
     order by updated_at
     limit 20
  loop
    perform net.http_post(
      url := rtrim(v_base, '/') || '/render-document-pdf',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
      body := jsonb_build_object('document_id', j.document_id),
      timeout_milliseconds := 5000
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_kick_pdf_jobs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('esign-kick-pdf-jobs', '*/2 * * * *', 'select public.esign_kick_pdf_jobs();');

-- Realtime: trang ký cần thấy pdf_status đổi sang 'ready' (custom_documents đã
-- nằm trong publication từ Giai đoạn 1).
