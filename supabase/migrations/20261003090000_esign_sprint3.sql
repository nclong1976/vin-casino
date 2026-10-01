-- Ký văn bản đợt 3 (spec hợp đồng v3.1 - docs/design/contract-management-
-- spec.md mục 0.2 Q2, 2.4, 3.1, 5.5, 6.1):
--   1) Lọc người nhận hàng loạt: thêm tiêu chí tổng đã nạp, đang đầu tư dự
--      án; audience {type:'filter'} khi phát hành.
--   2) Web Push cho người dùng: bảng thiết bị đăng ký + gửi push khi có
--      thông báo văn bản (mới / nhắc / gia hạn / thu hồi / hết hạn).
--   3) Giới hạn tần suất ký 5 lần/phút/người.

-- ─── 1) Bộ lọc người nhận ─────────────────────────────────────────────────
-- Bộ lọc: { membership_tier: [..], vip_level: [..], exclude_locked: bool,
--   created_from: 'YYYY-MM-DD', created_to: 'YYYY-MM-DD',
--   min_total_deposited: số (VNĐ), project_ids: [..], active_investment: bool }
-- project_ids: có khoản đầu tư (bảng transactions) vào 1 trong các dự án;
-- active_investment: chỉ tính khoản chưa tất toán (payout_status <> 'paid').
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
         or u.created_at < (((f->>'created_to')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'))
    and (nullif(f->>'min_total_deposited', '') is null
         or coalesce(u.total_deposited, 0) >= (f->>'min_total_deposited')::numeric)
    and (
      (coalesce(jsonb_array_length(f->'project_ids'), 0) = 0 and not coalesce((f->>'active_investment')::boolean, false))
      or exists (
        select 1 from public.transactions t
         where t.user_id = u.id
           and (coalesce(jsonb_array_length(f->'project_ids'), 0) = 0
                or t.project_id in (select jsonb_array_elements_text(f->'project_ids')))
           and (not coalesce((f->>'active_investment')::boolean, false) or coalesce(t.payout_status, 'pending') <> 'paid')
      )
    );
$function$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_project ON public.transactions (user_id, project_id);

-- Thêm loại {type:'filter', filters:{..}, include_user_ids:[..], exclude_user_ids:[..]}.
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
  elsif v_type = 'filter' then
    return query
      select distinct x.user_id from (
        select u.id as user_id from public.users u
         where public.esign_user_matches_filters(u, coalesce(p_audience->'filters', '{}'::jsonb))
        union
        select u.id from public.users u
         where u.id in (select jsonb_array_elements_text(coalesce(p_audience->'include_user_ids', '[]'::jsonb)))
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

-- Xem trước: thêm tổng đã nạp vào danh sách mẫu.
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
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'full_name', coalesce(s.full_name, s.name), 'email', s.email,
           'membership_tier', s.membership_tier, 'vip_level', s.vip_level, 'total_deposited', s.total_deposited)), '[]'::jsonb)
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

-- ─── 2) Web Push cho người dùng ───────────────────────────────────────────
-- Mỗi dòng là 1 PushSubscription của trình duyệt/thiết bị. Người dùng chỉ
-- thấy/sửa thiết bị của mình; Edge Function user-push-send đọc bằng service role.
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user ON public.user_push_subscriptions (user_id);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_push_subscriptions_own ON public.user_push_subscriptions;
CREATE POLICY user_push_subscriptions_own
  ON public.user_push_subscriptions FOR ALL
  TO authenticated
  USING (user_id = (select auth.uid())::text and not public.is_anon_session())
  WITH CHECK (user_id = (select auth.uid())::text and not public.is_anon_session());

REVOKE ALL ON public.user_push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;

-- Đăng ký thiết bị (endpoint có thể đã thuộc tài khoản khác đăng nhập trước
-- trên cùng trình duyệt → chuyển sang tài khoản hiện tại).
CREATE OR REPLACE FUNCTION public.save_user_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or public.is_anon_session() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'subscription không hợp lệ' using errcode = '22023';
  end if;
  insert into public.user_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid()::text, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_user_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_user_push_subscription(text, text, text, text) TO authenticated;

-- Thông báo văn bản mới vào bảng notifications → gom cả câu lệnh (đợt phát
-- hành chèn hàng trăm dòng 1 lần) thành 1 lời gọi Edge Function. Chỉ gửi cho
-- người đã bật push, và bỏ qua đợt tắt kênh push (delivery_settings.channels.push = false).
CREATE OR REPLACE FUNCTION public.esign_push_document_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_base text;
  v_secret text;
  v_messages jsonb;
  v_chunk jsonb;
  v_n integer;
  v_i integer := 0;
begin
  if not exists (select 1 from new_rows n where n.type = 'document') then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', n.user_id,
           'title', n.title,
           'body', n.content,
           'url', '/document/' || (n.extra->>'document_id'),
           'tag', 'document-' || (n.extra->>'document_id'))), '[]'::jsonb)
    into v_messages
    from new_rows n
    left join public.custom_documents d on d.id = n.extra->>'document_id'
    left join public.document_campaigns c on c.id = coalesce(d.campaign_id, n.extra->>'campaign_id')
   where n.type = 'document'
     and n.extra ? 'document_id'
     and coalesce((c.delivery_settings -> 'channels' ->> 'push')::boolean, true)
     and exists (select 1 from public.user_push_subscriptions s where s.user_id = n.user_id);

  v_n := jsonb_array_length(v_messages);
  if v_n = 0 then
    return null;
  end if;

  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'esign_functions_base_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'esign_internal_secret' limit 1;
  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  while v_i < v_n loop
    select jsonb_agg(m) into v_chunk
      from (select m from jsonb_array_elements(v_messages) with ordinality as e(m, i) where i > v_i and i <= v_i + 200) s;
    perform net.http_post(
      url := rtrim(v_base, '/') || '/user-push-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Internal-Secret', v_secret),
      body := jsonb_build_object('messages', v_chunk),
      timeout_milliseconds := 10000
    );
    v_i := v_i + 200;
  end loop;
  return null;
exception when others then
  -- Push chỉ là kênh phụ: lỗi ở đây không được làm hỏng việc phát hành/nhắc ký.
  raise warning 'esign_push_document_notifications: %', sqlerrm;
  return null;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_push_document_notifications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS esign_push_document_notifications ON public.notifications;
CREATE TRIGGER esign_push_document_notifications
  AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.esign_push_document_notifications();

-- ─── 3) Giới hạn tần suất ký (spec 6.2) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.esign_rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE public.esign_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esign_rate_limits FROM anon, authenticated;

-- Ghi 1 lượt cho key trong cửa sổ cố định p_window_seconds; true = còn trong
-- hạn mức. Chỉ service role (Edge Function) gọi.
CREATE OR REPLACE FUNCTION public.esign_rate_hit(p_key text, p_limit integer, p_window_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  v_hits integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  insert into public.esign_rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- Dọn cửa sổ cũ thỉnh thoảng (≈1% lời gọi).
  if random() < 0.01 then
    delete from public.esign_rate_limits where window_start < now() - interval '1 hour';
  end if;
  return v_hits <= p_limit;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.esign_rate_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esign_rate_hit(text, integer, integer) TO service_role;
