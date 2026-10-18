-- ============================================================================
-- Admin Tier System (Super Admin + Regular Admin)
--
-- Thiết lập hệ thống phân cấp admin:
-- - leo11o2: Super Admin (toàn quyền, không thể bị demote bởi admin thường)
-- - leo1102@vinclub.com: Demote thành Regular Admin (quyền hạn chế)
-- - Regular Admins: Không thể nhìn thấy hay quản lý Super Admin
--
-- Tạo bảng vip_conversations cho private chat giữa Super Admin và người chơi
-- ============================================================================

-- 1. Cập nhật is_super_admin() function - loại bỏ leo1102@vinclub.com khỏi bootstrap
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT is_super_admin FROM public.users WHERE id = auth.uid()::text), false)
    OR lower(COALESCE((auth.jwt() ->> 'email'), '')) = 'nclong1976@gmail.com';
$function$;

-- 2. Tạo bảng vip_conversations cho private chat
CREATE TABLE IF NOT EXISTS public.vip_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  super_admin_id text NOT NULL,
  player_id text NOT NULL,
  title text DEFAULT 'VIP Support'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT vip_conversations_super_admin_fk FOREIGN KEY (super_admin_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT vip_conversations_player_fk FOREIGN KEY (player_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT vip_conversations_unique_pair UNIQUE(super_admin_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_vip_conversations_super_admin ON public.vip_conversations(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_vip_conversations_player ON public.vip_conversations(player_id);

-- 3. Tạo bảng vip_messages cho tin nhắn trong VIP conversations
CREATE TABLE IF NOT EXISTS public.vip_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL,
  sender_id text NOT NULL,
  content text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vip_messages_conversation_fk FOREIGN KEY (conversation_id) REFERENCES public.vip_conversations(id) ON DELETE CASCADE,
  CONSTRAINT vip_messages_sender_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vip_messages_conversation ON public.vip_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vip_messages_sender ON public.vip_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_vip_messages_created ON public.vip_messages(created_at DESC);

-- 4. RLS cho vip_conversations - chỉ super admin hoặc player liên quan mới thấy được
DROP POLICY IF EXISTS "vip_conversations_select_policy" ON public.vip_conversations;
CREATE POLICY "vip_conversations_select_policy"
  ON public.vip_conversations FOR SELECT
  USING (
    auth.uid()::text = super_admin_id
    OR auth.uid()::text = player_id
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "vip_conversations_insert_policy" ON public.vip_conversations;
CREATE POLICY "vip_conversations_insert_policy"
  ON public.vip_conversations FOR INSERT
  WITH CHECK (
    public.is_super_admin() AND auth.uid()::text = super_admin_id
  );

DROP POLICY IF EXISTS "vip_conversations_update_policy" ON public.vip_conversations;
CREATE POLICY "vip_conversations_update_policy"
  ON public.vip_conversations FOR UPDATE
  USING (
    public.is_super_admin() AND auth.uid()::text = super_admin_id
  );

-- 5. RLS cho vip_messages
DROP POLICY IF EXISTS "vip_messages_select_policy" ON public.vip_messages;
CREATE POLICY "vip_messages_select_policy"
  ON public.vip_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vip_conversations vc
      WHERE vc.id = conversation_id
      AND (auth.uid()::text = vc.super_admin_id OR auth.uid()::text = vc.player_id)
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "vip_messages_insert_policy" ON public.vip_messages;
CREATE POLICY "vip_messages_insert_policy"
  ON public.vip_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vip_conversations vc
      WHERE vc.id = conversation_id
      AND (auth.uid()::text = vc.super_admin_id OR auth.uid()::text = vc.player_id)
    )
    AND auth.uid()::text = sender_id
  );

-- 6. Enable RLS
ALTER TABLE public.vip_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_messages ENABLE ROW LEVEL SECURITY;

-- 7. Demote leo1102@vinclub.com to regular admin
UPDATE public.users
SET role = 'admin', is_super_admin = false
WHERE email = 'leo1102@vinclub.com';

-- 8. Add RLS to users table to hide super-admin from regular admins
-- Regular admins can only see regular users and other regular admins, not super-admins
DROP POLICY IF EXISTS "users_select_hide_super_admin" ON public.users;
CREATE POLICY "users_select_hide_super_admin"
  ON public.users FOR SELECT
  USING (
    -- Super admin can see everyone
    public.is_super_admin()
    -- Regular users and regular admins cannot see super-admin accounts
    OR (NOT COALESCE(is_super_admin, false))
  );

COMMENT ON TABLE public.vip_conversations IS 'Private conversations between Super Admin and specific players. Regular admins cannot see these.';
COMMENT ON TABLE public.vip_messages IS 'Messages in VIP conversations. Only super admin and the player can see messages in their conversation.';
