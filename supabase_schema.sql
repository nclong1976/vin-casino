-- ====================================================================
-- SUPABASE DATABASE SCHEMA CHO VINCLUB CASINO & BẤT ĐỘNG SẢN
-- ====================================================================

-- 1. BẢNG USERS
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  identifier TEXT,
  name TEXT DEFAULT 'Hội viên VinClub',
  full_name TEXT DEFAULT 'Hội viên VinClub',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  balance BIGINT DEFAULT 0,
  total_deposited BIGINT DEFAULT 0,
  membership_tier TEXT DEFAULT 'VIP 1 - Gold',
  vip_level TEXT DEFAULT 'VIP 1',
  is_locked BOOLEAN DEFAULT FALSE,
  avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
  bank_name TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  account_holder TEXT DEFAULT '',
  referral_code TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. BẢNG WALLET_TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  code TEXT,
  description TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_holder TEXT,
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BẢNG MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT 'user',
  text TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BẢNG INVESTMENT_PROJECTS
CREATE TABLE IF NOT EXISTS public.investment_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  name TEXT,
  category TEXT DEFAULT 'VinHomes',
  location TEXT DEFAULT '',
  image TEXT,
  price_per_m2 NUMERIC DEFAULT 0,
  price_str TEXT DEFAULT '',
  rate TEXT DEFAULT '0.5%/ngày',
  annual_yield NUMERIC DEFAULT 0.5,
  area TEXT DEFAULT '',
  progress NUMERIC DEFAULT 80,
  min_amount NUMERIC DEFAULT 1000000,
  duration TEXT DEFAULT '30 ngày',
  scale TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT DEFAULT '',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- CHỈ MỤC (INDEXES)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_status ON public.wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions(created_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON public.messages(user_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ====================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access users" ON public.users;
CREATE POLICY "Public access users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Public access wallet_transactions" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access notifications" ON public.notifications;
CREATE POLICY "Public access notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access messages" ON public.messages;
CREATE POLICY "Public access messages" ON public.messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access investment_projects" ON public.investment_projects;
CREATE POLICY "Public access investment_projects" ON public.investment_projects FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- TRIGGER AUTH KHI CÓ USER MỚI ĐĂNG KÝ
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    identifier,
    name,
    full_name,
    phone,
    role,
    balance,
    membership_tier,
    avatar_url,
    created_at,
    last_active
  ) VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE((NEW.raw_user_meta_data->>'balance')::BIGINT, 0),
    COALESCE(NEW.raw_user_meta_data->>'membership_tier', 'VIP 1 - Gold'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_active = NOW(),
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
