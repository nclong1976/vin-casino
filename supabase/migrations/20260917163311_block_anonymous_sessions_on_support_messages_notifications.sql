-- Helper: true when the current request's JWT was issued to a Supabase
-- "anonymous sign-in" session (role claim is `authenticated`, but the JWT
-- carries is_anonymous=true). Used as a defense-in-depth guard on top of
-- disabling the Anonymous Sign-ins provider in Auth settings, in case
-- already-issued anonymous sessions are still live.
create or replace function public.is_anon_session()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- support_conversations
alter policy support_conversations_write_admin_only on public.support_conversations
  using ((select is_admin()) and not public.is_anon_session())
  with check ((select is_admin()) and not public.is_anon_session());

alter policy support_conversations_insert_own_or_admin on public.support_conversations
  with check (
    (((select auth.uid())::text = user_id) or (select is_admin()))
    and not public.is_anon_session()
  );

alter policy support_conversations_select_own_or_admin on public.support_conversations
  using (
    (((select auth.uid())::text = user_id) or ((select auth.uid())::text = id) or (select is_admin()))
    and not public.is_anon_session()
  );

-- messages
alter policy messages_delete_admin_only on public.messages
  using ((select is_admin()) and not public.is_anon_session());

alter policy messages_insert_own_or_admin on public.messages
  with check (
    ((((select auth.uid())::text = user_id) and (sender = 'user'::text)) or (select is_admin()))
    and not public.is_anon_session()
  );

alter policy messages_select_own_or_admin on public.messages
  using (
    (((select auth.uid())::text = user_id) or (select is_admin()))
    and not public.is_anon_session()
  );

alter policy messages_update_own_or_admin on public.messages
  using (
    (((select auth.uid())::text = user_id) or (select is_admin()))
    and not public.is_anon_session()
  )
  with check (
    (((select auth.uid())::text = user_id) or (select is_admin()))
    and not public.is_anon_session()
  );

-- notifications
alter policy notifications_delete_own_or_admin on public.notifications
  using (
    ((user_id = (select auth.uid())::text) or is_admin_user())
    and not public.is_anon_session()
  );

alter policy notifications_insert_own_or_admin on public.notifications
  with check (
    ((user_id = (select auth.uid())::text) or is_admin_user())
    and not public.is_anon_session()
  );

alter policy notifications_select_own_or_admin on public.notifications
  using (
    ((user_id is null) or (user_id = (select auth.uid())::text) or is_admin_user())
    and not public.is_anon_session()
  );

alter policy notifications_update_own_or_admin on public.notifications
  using (
    ((user_id = (select auth.uid())::text) or is_admin_user())
    and not public.is_anon_session()
  )
  with check (
    ((user_id = (select auth.uid())::text) or is_admin_user())
    and not public.is_anon_session()
  );
