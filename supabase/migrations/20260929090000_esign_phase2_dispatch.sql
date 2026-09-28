-- Giai đoạn 2 "Ký văn bản điện tử" - Sprint 2 (T10, T11, T12b): nhóm người
-- dùng, phát hành theo lô, thu hồi/nhắc/gia hạn lưu trữ. Xem
-- docs/design/e-sign-letterhead-spec.md mục 4.4, 4.8, 4.10, 8.1, 8.2.

-- ─── 1) Thời gian lưu trữ: 0 = vĩnh viễn, NULL = theo cấp trên ─────────────
ALTER TABLE public.document_templates DROP CONSTRAINT IF EXISTS document_templates_retention_days_check;
ALTER TABLE public.document_templates ADD CONSTRAINT document_templates_retention_days_check CHECK (retention_days IS NULL OR retention_days >= 0);
ALTER TABLE public.document_campaigns DROP CONSTRAINT IF EXISTS document_campaigns_retention_days_check;
ALTER TABLE public.document_campaigns ADD CONSTRAINT document_campaigns_retention_days_check CHECK (retention_days IS NULL OR retention_days >= 0);
ALTER TABLE public.custom_documents DROP CONSTRAINT IF EXISTS custom_documents_retention_days_check;
ALTER TABLE public.custom_documents ADD CONSTRAINT custom_documents_retention_days_check CHECK (retention_days IS NULL OR retention_days >= 0);

-- custom_documents.status thêm 'revoked' / 'expired' (cột text không có CHECK
-- nên không cần đổi ràng buộc - chỉ ghi chú cho người đọc schema).

-- ─── 2) Trạng thái phát hành theo lô ──────────────────────────────────────
-- Snapshot mẫu + khung văn bản chụp 1 lần khi bắt đầu phát hành để mọi lô
-- (có thể chạy ở nhiều lần gọi Edge Function) dùng đúng cùng một nội dung.
ALTER TABLE public.document_campaigns
  ADD COLUMN template_snapshot jsonb,
  ADD COLUMN letterhead_snapshot jsonb,
  ADD COLUMN resolved_retention_days integer,
  ADD COLUMN processed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN failed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN last_error text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- ─── 3) Quyền: admin (qua PostgREST) hoặc service role (Edge Function) ────
CREATE OR REPLACE FUNCTION public.esign_is_admin_or_service()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(auth.role() = 'service_role', false) or (public.is_admin() and not public.is_anon_session());
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_is_admin_or_service() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esign_is_admin_or_service() TO authenticated, service_role;

-- ─── 4) Người nhận ────────────────────────────────────────────────────────
-- Bộ lọc nhóm động: { membership_tier: [..], vip_level: [..], exclude_locked:
-- bool, created_from: 'YYYY-MM-DD', created_to: 'YYYY-MM-DD' }. Mảng rỗng /
-- thiếu khoá = không lọc theo tiêu chí đó.
CREATE OR REPLACE FUNCTION public.esign_user_matches_filters(u public.users, f jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  select
    coalesce(u.role, 'user') not in ('admin', 'ADMIN')
    and (coalesce(jsonb_array_length(f->'membership_tier'), 0) = 0
         or u.membership_tier in (select jsonb_array_elements_text(f->'membership_tier')))
    and (coalesce(jsonb_array_length(f->'vip_level'), 0) = 0
         or u.vip_level in (select jsonb_array_elements_text(f->'vip_level')))
    and (not coalesce((f->>'exclude_locked')::boolean, true) or not coalesce(u.is_locked, false))
    and (nullif(f->>'created_from', '') is null
         or u.created_at >= ((f->>'created_from')::date::timestamp at time zone 'Asia/Ho_Chi_Minh'))
    and (nullif(f->>'created_to', '') is null
         or u.created_at < (((f->>'created_to')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'));
$function$;

-- Danh sách user_id (không trùng) của một audience (spec 4.4):
--   {type:'user'|'users', user_ids:[..]}
--   {type:'groups', group_ids:[..], include_user_ids:[..], exclude_user_ids:[..]}
--   {type:'all', exclude_locked:bool}
CREATE OR REPLACE FUNCTION public.esign_audience_user_ids(p_audience jsonb)
RETURNS TABLE(user_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_type text := coalesce(p_audience->>'type', '');
begin
  if not public.esign_is_admin_or_service() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v_type in ('user', 'users') then
    return query
      select distinct u.id from public.users u
      where u.id in (select jsonb_array_elements_text(coalesce(p_audience->'user_ids', '[]'::jsonb)));
  elsif v_type = 'groups' then
    return query
      with gids as (
        select jsonb_array_elements_text(coalesce(p_audience->'group_ids', '[]'::jsonb)) as id
      ), static_members as (
        select m.user_id from public.user_group_members m
        join public.user_groups g on g.id = m.group_id and g.kind = 'static'
        where m.group_id in (select id from gids)
      ), dynamic_members as (
        select u.id as user_id from public.users u
        join public.user_groups g on g.kind = 'dynamic' and g.id in (select id from gids)
        where public.esign_user_matches_filters(u, g.filters)
      ), included as (
        select u.id as user_id from public.users u
        where u.id in (select jsonb_array_elements_text(coalesce(p_audience->'include_user_ids', '[]'::jsonb)))
      )
      select distinct x.user_id from (
        select sm.user_id from static_members sm
        union select dm.user_id from dynamic_members dm
        union select i.user_id from included i
      ) x
      where x.user_id not in (select jsonb_array_elements_text(coalesce(p_audience->'exclude_user_ids', '[]'::jsonb)));
  elsif v_type = 'all' then
    return query
      select u.id from public.users u
      where coalesce(u.role, 'user') not in ('admin', 'ADMIN')
        and (not coalesce((p_audience->>'exclude_locked')::boolean, true) or not coalesce(u.is_locked, false));
  else
    raise exception 'audience type không hợp lệ: %', v_type using errcode = '22023';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.count_campaign_audience(p_audience jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select count(*)::integer from public.esign_audience_user_ids(p_audience);
$function$;

-- Trang người nhận tiếp theo (sắp theo id, sau con trỏ p_after) kèm các cột
-- cần để sinh biến hệ thống - Edge Function phát hành gọi theo lô.
CREATE OR REPLACE FUNCTION public.esign_audience_page(p_audience jsonb, p_after text, p_limit integer)
RETURNS TABLE(
  id text, full_name text, name text, email text, phone text, identifier text,
  id_card_number text, membership_tier text, vip_level text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select u.id, u.full_name, u.name, u.email, u.phone, u.identifier, u.id_card_number, u.membership_tier, u.vip_level
  from public.users u
  where u.id in (select a.user_id from public.esign_audience_user_ids(p_audience) a)
    and (p_after is null or u.id > p_after)
  order by u.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

-- Xem trước nhóm động: số người khớp + vài người đầu.
CREATE OR REPLACE FUNCTION public.preview_group(p_filters jsonb, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_sample jsonb;
begin
  if not public.esign_is_admin_or_service() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select count(*) into v_count from public.users u where public.esign_user_matches_filters(u, coalesce(p_filters, '{}'::jsonb));
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'full_name', coalesce(s.full_name, s.name), 'email', s.email, 'membership_tier', s.membership_tier, 'vip_level', s.vip_level)), '[]'::jsonb)
    into v_sample
    from (
      select u.* from public.users u
      where public.esign_user_matches_filters(u, coalesce(p_filters, '{}'::jsonb))
      order by u.created_at desc nulls last
      limit greatest(0, least(coalesce(p_limit, 20), 100))
    ) s;
  return jsonb_build_object('count', v_count, 'sample', v_sample);
end;
$function$;

-- Số điện thoại VN về dạng 0xxxxxxxxx: bỏ ký tự không phải số, +84/84 → 0.
CREATE OR REPLACE FUNCTION public.esign_normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  select case
    when d ~ '^84\d{9}$' then '0' || substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$function$;

-- Import CSV vào nhóm tĩnh: khớp theo user id, email, mã hội viên
-- (identifier), username hoặc số điện thoại.
CREATE OR REPLACE FUNCTION public.import_group_members(p_group_id text, p_identifiers text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_added integer := 0;
  v_duplicated integer := 0;
  v_not_found text[] := '{}';
  v_raw text;
  v_key text;
  v_user_id text;
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_groups where id = p_group_id and kind = 'static') then
    raise exception 'Nhóm không tồn tại hoặc không phải nhóm tĩnh' using errcode = '22023';
  end if;

  foreach v_raw in array coalesce(p_identifiers, '{}') loop
    v_key := lower(btrim(v_raw));
    continue when v_key = '';
    select u.id into v_user_id from public.users u
     where u.id = btrim(v_raw) or lower(u.email) = v_key or lower(u.identifier) = v_key
        or lower(u.username) = v_key
        or (length(public.esign_normalize_phone(v_key)) >= 9
            and public.esign_normalize_phone(u.phone) = public.esign_normalize_phone(v_key))
     order by (u.id = btrim(v_raw)) desc
     limit 1;
    if v_user_id is null then
      v_not_found := array_append(v_not_found, v_raw);
      continue;
    end if;
    insert into public.user_group_members (group_id, user_id, added_by)
    values (p_group_id, v_user_id, auth.uid()::text)
    on conflict do nothing;
    if found then v_added := v_added + 1; else v_duplicated := v_duplicated + 1; end if;
  end loop;

  return jsonb_build_object('added', v_added, 'duplicated', v_duplicated, 'not_found', to_jsonb(v_not_found));
end;
$function$;

-- ─── 5) Phát hành theo lô (chỉ Edge Function - service role) ──────────────
CREATE OR REPLACE FUNCTION public.esign_next_document_numbers(p_count integer)
RETURNS SETOF bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select nextval('public.document_no_seq') from generate_series(1, greatest(0, least(coalesce(p_count, 0), 1000)));
$function$;

-- Ghi 1 lô văn bản + thông báo chuông + nhật ký 'dispatched' + cập nhật con
-- trỏ trong CÙNG transaction. ON CONFLICT bỏ qua người đã nhận văn bản của
-- đợt này (lô có thể bị chạy lại khi Edge Function bị ngắt giữa chừng).
CREATE OR REPLACE FUNCTION public.esign_insert_campaign_batch(
  p_campaign_id text,
  p_docs jsonb,
  p_cursor text,
  p_failed jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_inserted integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with ins as (
    insert into public.custom_documents (
      id, user_id, title, document_type, content, status, created_by, created_date,
      template_id, variables_values, campaign_id, letterhead_snapshot, layout_snapshot,
      rendered_model, slot_boxes, content_sha256, doc_no, requires_signature, due_at,
      delivered_at, retention_days
    )
    select
      d.id, d.user_id, d.title, coalesce(d.document_type, ''), coalesce(d.content, ''), 'pending', d.created_by,
      coalesce(d.created_date, now()), d.template_id, coalesce(d.variables_values, '{}'::jsonb), p_campaign_id,
      d.letterhead_snapshot, d.layout_snapshot, d.rendered_model, d.slot_boxes, d.content_sha256, d.doc_no,
      coalesce(d.requires_signature, true), d.due_at, now(), d.retention_days
    from jsonb_to_recordset(p_docs) as d(
      id text, user_id text, title text, document_type text, content text, created_by text, created_date timestamptz,
      template_id text, variables_values jsonb, letterhead_snapshot jsonb, layout_snapshot jsonb, rendered_model jsonb,
      slot_boxes jsonb, content_sha256 text, doc_no text, requires_signature boolean, due_at timestamptz, retention_days integer
    )
    on conflict (campaign_id, user_id) where campaign_id is not null do nothing
    returning id, user_id, title, requires_signature, due_at
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select
      'ntf_' || replace(gen_random_uuid()::text, '-', ''),
      i.user_id,
      case when i.requires_signature then 'Bạn có văn bản mới cần ký' else 'Bạn có văn bản mới' end,
      '"' || i.title || '"' ||
        case when i.requires_signature
          then ' - vui lòng mở và ký' || coalesce(' trước ngày ' || to_char(i.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), '') || ' ngay trong ứng dụng.'
          else ' - vui lòng mở để xem chi tiết.'
        end,
      'document', false, now(),
      jsonb_build_object('document_id', i.id, 'campaign_id', p_campaign_id, 'requires_signature', i.requires_signature, 'due_at', i.due_at)
    from ins i
    returning 1
  ), ev as (
    insert into public.document_events (document_id, event, actor_id, data)
    select i.id, 'dispatched', 'system', jsonb_build_object('campaign_id', p_campaign_id) from ins i
    returning 1
  )
  select count(*) into v_inserted from ins;

  update public.document_campaigns
     set dispatch_cursor = coalesce(p_cursor, dispatch_cursor),
         processed_count = processed_count + v_inserted,
         failed = failed || coalesce(p_failed, '[]'::jsonb),
         updated_at = now()
   where id = p_campaign_id;

  return v_inserted;
end;
$function$;

-- ─── 6) Thu hồi / nhắc / gia hạn lưu trữ (Admin) ──────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_document_campaign(p_campaign_id text, p_only_unsigned boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with upd as (
    update public.custom_documents
       set status = 'revoked'
     where campaign_id = p_campaign_id
       and status = 'pending'
    returning id
  ), ev as (
    insert into public.document_events (document_id, event, actor_id)
    select id, 'revoked', auth.uid()::text from upd
    returning 1
  )
  select count(*) into v_count from upd;

  update public.document_campaigns
     set status = case when p_only_unsigned then status else 'revoked' end,
         updated_at = now()
   where id = p_campaign_id;
  -- Chưa phát hành xong (draft/scheduled/dispatching) thì dừng hẳn.
  update public.document_campaigns
     set status = 'revoked', updated_at = now()
   where id = p_campaign_id and status in ('draft', 'scheduled', 'dispatching');

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remind_document_campaign(p_campaign_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  with pending as (
    select d.id, d.user_id, d.title, d.due_at
      from public.custom_documents d
     where d.campaign_id = p_campaign_id and d.status = 'pending' and d.requires_signature
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select 'ntf_' || replace(gen_random_uuid()::text, '-', ''), p.user_id, 'Nhắc: văn bản đang chờ bạn ký',
           '"' || p.title || '" vẫn chưa được ký' || coalesce(' - hạn ký ' || to_char(p.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), '') || '.',
           'document', false, now(), jsonb_build_object('document_id', p.id, 'campaign_id', p_campaign_id, 'reminder', true)
      from pending p
    returning 1
  )
  select count(*) into v_count from notif;
  return v_count;
end;
$function$;

-- p_retention_days: NULL = giữ nguyên, 0 = vĩnh viễn, > 0 = số ngày kể từ lúc ký.
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

  update public.custom_documents d
     set retention_days = coalesce(p_retention_days, d.retention_days),
         pdf_expires_at = case
           when d.signed_at is null then null
           when coalesce(p_retention_days, d.retention_days, 0) = 0 then null
           else d.signed_at + make_interval(days => coalesce(p_retention_days, d.retention_days))
         end,
         legal_hold = coalesce(p_legal_hold, d.legal_hold)
   where d.id = p_document_id;

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

-- ─── 7) Quyền gọi ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.esign_user_matches_filters(public.users, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_user_matches_filters(public.users, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.esign_audience_user_ids(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esign_audience_user_ids(jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.count_campaign_audience(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_campaign_audience(jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.esign_audience_page(jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_audience_page(jsonb, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.preview_group(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_group(jsonb, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.import_group_members(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_group_members(text, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.esign_next_document_numbers(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_next_document_numbers(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esign_insert_campaign_batch(text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_insert_campaign_batch(text, jsonb, text, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.revoke_document_campaign(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_document_campaign(text, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remind_document_campaign(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remind_document_campaign(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_document_retention(text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_document_retention(text, integer, boolean) TO authenticated;

-- ─── 8) Hẹn giờ + chạy tiếp đợt bị ngắt (pg_cron → Edge Function) ─────────
-- URL và secret đọc từ Supabase Vault (không hardcode vào git, giống
-- telegram_webhook_secret). Chưa nạp 2 secret này thì job không làm gì:
--   select vault.create_secret('https://<project>.supabase.co/functions/v1', 'esign_functions_base_url');
--   select vault.create_secret('<chuỗi ngẫu nhiên>', 'esign_internal_secret');
-- esign_internal_secret phải khớp secret ESIGN_INTERNAL_SECRET của Edge Function.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.esign_kick_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_base text;
  v_secret text;
  v_count integer := 0;
  c record;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'esign_functions_base_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'esign_internal_secret' limit 1;
  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    return 0;
  end if;

  for c in
    select id from public.document_campaigns
     where (status = 'scheduled' and scheduled_at <= now())
        or (status = 'dispatching' and updated_at < now() - interval '2 minutes')
     order by created_date
     limit 10
  loop
    perform net.http_post(
      url := rtrim(v_base, '/') || '/dispatch-campaign',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
      body := jsonb_build_object('campaign_id', c.id),
      timeout_milliseconds := 5000
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_kick_campaigns() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('esign-kick-campaigns', '* * * * *', 'select public.esign_kick_campaigns();');
