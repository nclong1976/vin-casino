-- Ký văn bản đợt 2: trạng thái chi tiết, cài đặt gửi, nhắc ký và hết hạn tự
-- động, thao tác hàng loạt (spec hợp đồng v3.1 - docs/design/contract-
-- management-spec.md mục 1.4, 2.4, 2.5, 4.7, 5.1, 5.5).
--
-- Trạng thái hiển thị suy ra từ cột sẵn có (không đổi giá trị status trong
-- DB): pending + first_viewed_at → "Đã xem"; pending + delivered_at → "Đã
-- nhận"; pending còn lại → "Đã gửi". Từ nay delivered_at = lúc người nhận tải
-- văn bản về máy lần đầu (trước đây ghi luôn lúc phát hành).

-- ─── 1) Cột mới ───────────────────────────────────────────────────────────
ALTER TABLE public.document_campaigns
  ADD COLUMN IF NOT EXISTS delivery_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.custom_documents
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

ALTER TABLE public.document_events
  ADD COLUMN IF NOT EXISTS device jsonb;

CREATE INDEX IF NOT EXISTS idx_custom_documents_pending_due
  ON public.custom_documents (due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_document_events_created
  ON public.document_events (created_at DESC);

-- ─── 2) Trạng thái hiển thị (dùng chung cho thống kê) ─────────────────────
CREATE OR REPLACE FUNCTION public.esign_display_status(p_status text, p_due_at timestamptz, p_first_viewed_at timestamptz, p_delivered_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  select case
    when p_status = 'pending' and p_due_at is not null and p_due_at < now() then 'expired'
    when p_status = 'pending' and p_first_viewed_at is not null then 'viewed'
    when p_status = 'pending' and p_delivered_at is not null then 'delivered'
    when p_status = 'pending' then 'sent'
    else p_status
  end;
$$;

-- ─── 3) Phát hành: không còn ghi delivered_at ngay lúc gửi ────────────────
CREATE OR REPLACE FUNCTION public.esign_insert_campaign_batch(p_campaign_id text, p_docs jsonb, p_cursor text, p_failed jsonb DEFAULT '[]'::jsonb)
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
      coalesce(d.requires_signature, true), d.due_at, null, d.retention_days
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

-- ─── 4) Người nhận: đã nhận / đã xem ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_documents_delivered(p_document_ids text[], p_device jsonb DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if public.is_anon_session() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  perform set_config('esign.trusted_write', 'on', true);
  with upd as (
    update public.custom_documents
       set delivered_at = now()
     where id = any(coalesce(p_document_ids, '{}'::text[]))
       and user_id = (select auth.uid())::text
       and delivered_at is null
       and rendered_model is not null
    returning id
  ), ev as (
    insert into public.document_events (document_id, event, actor_id, device)
    select id, 'delivered', auth.uid()::text, p_device from upd
    returning 1
  )
  select count(*) into v_count from upd;
  perform set_config('esign.trusted_write', 'off', true);
  return v_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_documents_delivered(text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_documents_delivered(text[], jsonb) TO authenticated;

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
    return null;
  end if;
  if v_doc.first_viewed_at is null then
    perform set_config('esign.trusted_write', 'on', true);
    update public.custom_documents
       set first_viewed_at = now(),
           delivered_at = coalesce(delivered_at, now())
     where id = p_document_id;
    perform set_config('esign.trusted_write', 'off', true);
    insert into public.document_events (document_id, event, actor_id) values (p_document_id, 'viewed', auth.uid()::text);
    return now();
  end if;
  return v_doc.first_viewed_at;
end;
$function$;

-- ─── 5) Admin: nhắc / gia hạn / thu hồi theo danh sách văn bản ────────────
CREATE OR REPLACE FUNCTION public.remind_documents(p_document_ids text[])
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
  perform set_config('esign.trusted_write', 'on', true);
  with docs as (
    update public.custom_documents d
       set last_reminded_at = now()
     where d.id = any(coalesce(p_document_ids, '{}'::text[]))
       and d.status = 'pending'
       and (d.due_at is null or d.due_at >= now())
       and d.rendered_model is not null
    returning d.id, d.user_id, d.title, d.due_at, d.requires_signature
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select 'ntf_' || replace(gen_random_uuid()::text, '-', ''), d.user_id,
           case when d.requires_signature then 'Nhắc: văn bản đang chờ bạn ký' else 'Nhắc: văn bản đang chờ bạn xác nhận' end,
           '"' || d.title || '" vẫn chưa hoàn tất' || coalesce(' - hạn ' || to_char(d.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), '') || '.',
           'document', false, now(), jsonb_build_object('document_id', d.id, 'reminder', true)
      from docs d
    returning 1
  ), ev as (
    insert into public.document_events (document_id, event, actor_id, data)
    select d.id, 'reminded', auth.uid()::text, jsonb_build_object('manual', true) from docs d
    returning 1
  )
  select count(*) into v_count from docs;
  perform set_config('esign.trusted_write', 'off', true);
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.extend_document_due(p_document_ids text[], p_due_at timestamptz)
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
  if p_due_at is null or p_due_at <= now() then
    raise exception 'Hạn ký mới phải ở tương lai' using errcode = '22023';
  end if;
  perform set_config('esign.trusted_write', 'on', true);
  with docs as (
    update public.custom_documents d
       set status = 'pending', due_at = p_due_at, reminder_count = 0
     where d.id = any(coalesce(p_document_ids, '{}'::text[]))
       and d.status in ('pending', 'expired')
       and d.locked_at is null
       and d.rendered_model is not null
    returning d.id, d.user_id, d.title
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select 'ntf_' || replace(gen_random_uuid()::text, '-', ''), d.user_id, 'Văn bản được gia hạn ký',
           '"' || d.title || '" được gia hạn ký đến ngày ' || to_char(p_due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '.',
           'document', false, now(), jsonb_build_object('document_id', d.id, 'due_at', p_due_at)
      from docs d
    returning 1
  ), ev as (
    insert into public.document_events (document_id, event, actor_id, data)
    select d.id, 'extended', auth.uid()::text, jsonb_build_object('due_at', p_due_at) from docs d
    returning 1
  )
  select count(*) into v_count from docs;
  perform set_config('esign.trusted_write', 'off', true);
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_documents(p_document_ids text[], p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_reason text := nullif(btrim(left(coalesce(p_reason, ''), 300)), '');
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Vui lòng nhập lý do thu hồi' using errcode = '22023';
  end if;
  perform set_config('esign.trusted_write', 'on', true);
  with docs as (
    update public.custom_documents d
       set status = 'revoked', revoked_reason = v_reason, revoked_by = auth.uid()::text
     where d.id = any(coalesce(p_document_ids, '{}'::text[]))
       and d.status in ('pending', 'expired')
       and d.locked_at is null
    returning d.id, d.user_id, d.title
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select 'ntf_' || replace(gen_random_uuid()::text, '-', ''), d.user_id, 'Văn bản đã bị thu hồi',
           '"' || d.title || '" đã được thu hồi, bạn không cần ký văn bản này nữa.',
           'document', false, now(), jsonb_build_object('document_id', d.id, 'revoked', true)
      from docs d
    returning 1
  ), ev as (
    insert into public.document_events (document_id, event, actor_id, data)
    select d.id, 'revoked', auth.uid()::text, jsonb_build_object('reason', v_reason) from docs d
    returning 1
  )
  select count(*) into v_count from docs;
  perform set_config('esign.trusted_write', 'off', true);
  return v_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.remind_documents(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remind_documents(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.extend_document_due(text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_document_due(text[], timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_documents(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_documents(text[], text) TO authenticated;

-- ─── 6) Thống kê cho màn Tổng quan ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.esign_document_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  v_counts jsonb;
  v_funnel jsonb;
  v_median numeric;
begin
  if not (public.is_admin() and not public.is_anon_session()) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) into v_counts from (
    select public.esign_display_status(status, due_at, first_viewed_at, delivered_at) s, count(*) n
      from public.custom_documents where rendered_model is not null group by 1
  ) t;

  select jsonb_build_object(
           'sent', count(*),
           'viewed', count(*) filter (where first_viewed_at is not null),
           'signed', count(*) filter (where signed_at is not null))
    into v_funnel
    from public.custom_documents
   where rendered_model is not null and created_date >= v_since;

  select percentile_cont(0.5) within group (order by extract(epoch from (signed_at - created_date)) / 3600.0)
    into v_median
    from public.custom_documents
   where rendered_model is not null and signed_at is not null and created_date >= v_since;

  return jsonb_build_object(
    'counts', v_counts,
    'drafts', (select count(*) from public.document_campaigns where status in ('draft', 'scheduled')),
    'funnel', v_funnel,
    'median_sign_hours', round(v_median, 1),
    'due_soon', (select count(*) from public.custom_documents
                  where status = 'pending' and rendered_model is not null and due_at between now() and now() + interval '48 hours'),
    'pdf_failed', (select count(*) from public.custom_documents where pdf_status = 'failed'),
    'retention_soon', (select count(*) from public.custom_documents
                        where pdf_status = 'ready' and not coalesce(legal_hold, false)
                          and pdf_expires_at between now() and now() + interval '7 days')
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_document_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esign_document_stats(integer) TO authenticated;

-- ─── 7) Nhắc ký + hết hạn tự động (pg_cron mỗi 15 phút) ───────────────────
-- delivery_settings.reminders = { enabled: true, days_before: [3,1,0], at: "09:00" }
-- Mỗi mốc gửi lúc <at> giờ VN của ngày (hạn ký - N ngày). Mốc đã qua trước
-- lúc phát hành bị bỏ (không nhắc dồn ngay khi vừa gửi văn bản).
CREATE OR REPLACE FUNCTION public.esign_process_due_documents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_expired integer := 0;
  v_reminded integer := 0;
  r record;
  v_days integer[];
  v_at time;
  v_i integer;
  v_pick integer;
  v_pick_days integer;
  v_t timestamptz;
  v_left integer;
begin
  perform set_config('esign.trusted_write', 'on', true);

  -- Hết hạn.
  with exp as (
    update public.custom_documents d
       set status = 'expired'
     where d.status = 'pending'
       and d.due_at is not null and d.due_at < now()
       and d.rendered_model is not null
       and coalesce((select (c.delivery_settings ->> 'auto_expire')::boolean from public.document_campaigns c where c.id = d.campaign_id), true)
    returning d.id, d.user_id, d.title
  ), notif as (
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    select 'ntf_' || replace(gen_random_uuid()::text, '-', ''), e.user_id, 'Văn bản đã quá hạn ký',
           '"' || e.title || '" đã quá hạn ký. Vui lòng liên hệ CSKH nếu bạn vẫn cần ký.',
           'document', false, now(), jsonb_build_object('document_id', e.id, 'expired', true)
      from exp e
    returning 1
  ), ev as (
    insert into public.document_events (document_id, event, actor_id)
    select e.id, 'expired', 'system' from exp e
    returning 1
  )
  select count(*) into v_expired from exp;

  -- Nhắc ký.
  for r in
    select d.id, d.user_id, d.title, d.due_at, d.created_date, d.reminder_count, d.requires_signature, c.delivery_settings -> 'reminders' as rem
      from public.custom_documents d
      left join public.document_campaigns c on c.id = d.campaign_id
     where d.status = 'pending'
       and d.rendered_model is not null
       and d.due_at is not null and d.due_at >= now()
       and coalesce((c.delivery_settings -> 'reminders' ->> 'enabled')::boolean, true)
     order by d.due_at
     limit 2000
  loop
    select coalesce(array_agg(x order by x desc), array[3, 1, 0])
      into v_days
      from (select distinct (jsonb_array_elements_text(case when jsonb_typeof(r.rem -> 'days_before') = 'array' then r.rem -> 'days_before' else '[]'::jsonb end))::integer x) s
     where x between 0 and 30;
    if v_days is null or array_length(v_days, 1) is null then v_days := array[3, 1, 0]; end if;
    v_at := coalesce(nullif(r.rem ->> 'at', '')::time, time '09:00');

    v_pick := null;
    for v_i in coalesce(r.reminder_count, 0) + 1 .. coalesce(array_length(v_days, 1), 0) loop
      v_t := (((r.due_at at time zone 'Asia/Ho_Chi_Minh')::date - v_days[v_i]) + v_at) at time zone 'Asia/Ho_Chi_Minh';
      if v_t <= now() and v_t > r.created_date then
        v_pick := v_i;
        v_pick_days := v_days[v_i];
      end if;
    end loop;
    continue when v_pick is null;

    -- Số ngày còn lại thực tế (mốc có thể được gửi bù muộn hơn lịch).
    v_left := (r.due_at at time zone 'Asia/Ho_Chi_Minh')::date - (now() at time zone 'Asia/Ho_Chi_Minh')::date;
    update public.custom_documents set reminder_count = v_pick, last_reminded_at = now() where id = r.id;
    insert into public.notifications (id, user_id, title, content, type, is_read, created_date, extra)
    values ('ntf_' || replace(gen_random_uuid()::text, '-', ''), r.user_id,
            case when v_left <= 0 then 'Hôm nay là hạn cuối ký văn bản' else 'Nhắc: còn ' || v_left || ' ngày để ký văn bản' end,
            '"' || r.title || '" ' || case when r.requires_signature then 'đang chờ bạn ký' else 'đang chờ bạn xác nhận' end ||
              ' - hạn ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '.',
            'document', false, now(), jsonb_build_object('document_id', r.id, 'reminder', true));
    insert into public.document_events (document_id, event, actor_id, data)
    values (r.id, 'reminded', 'system', jsonb_build_object('auto', true, 'days_before', v_pick_days));
    v_reminded := v_reminded + 1;
  end loop;

  perform set_config('esign.trusted_write', 'off', true);
  return jsonb_build_object('expired', v_expired, 'reminded', v_reminded);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_process_due_documents() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'esign-process-due') THEN
    PERFORM cron.unschedule('esign-process-due');
  END IF;
END $$;
SELECT cron.schedule('esign-process-due', '*/15 * * * *', 'select public.esign_process_due_documents();');
