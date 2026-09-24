-- 1) support_conversations: scope existing policies to authenticated,
--    and add an INSERT policy so regular authenticated users can open
--    a new support conversation (previously only admins could write at all).
alter policy support_conversations_select_own_or_admin
  on public.support_conversations
  to authenticated;

alter policy support_conversations_write_admin_only
  on public.support_conversations
  to authenticated;

create policy support_conversations_insert_own_or_admin
  on public.support_conversations
  for insert
  to authenticated
  with check (
    ((select auth.uid())::text = user_id)
    or (select is_admin())
  );

-- 2) messages: these policies were scoped to `public` (i.e. evaluated for
--    anon too), which the linter flags as anonymous access exposure.
--    Their own logic requires auth.uid()/is_admin(), but scoping to
--    `authenticated` closes the anon-access surface at the role level too.
alter policy messages_delete_admin_only on public.messages to authenticated;
alter policy messages_insert_own_or_admin on public.messages to authenticated;
alter policy messages_select_own_or_admin on public.messages to authenticated;
alter policy messages_update_own_or_admin on public.messages to authenticated;

-- 3) notifications: notifications_insert_authenticated was scoped to
--    `public` AND had a with_check of (auth.role() = 'authenticated' OR is_admin()),
--    which lets ANY logged-in user insert a notification row for ANY
--    user_id (no ownership check at all). This is superseded by
--    notifications_insert_own_or_admin, which correctly restricts inserts
--    to the caller's own user_id or an admin. Rescoping the weak policy's
--    role alone would not have closed the hole, so it is dropped instead.
drop policy if exists notifications_insert_authenticated on public.notifications;
