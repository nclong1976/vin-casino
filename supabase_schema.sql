-- ====================================================================
-- SUPABASE DATABASE SCHEMA CHO VINCLUB CASINO & BẤT ĐỘNG SẢN (BẢN AN TOÀN)
-- Tự động thêm cột nếu bảng đã tồn tại từ trước để không bị lỗi column does not exist
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

-- Đảm bảo tất cả cột trong bảng users luôn tồn tại
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS identifier TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Hội viên VinClub';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT 'Hội viên VinClub';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposited BIGINT DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'VIP 1 - Gold';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vip_level TEXT DEFAULT 'VIP 1';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS account_holder TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. BẢNG WALLET_TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT DEFAULT 'deposit',
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

-- Đảm bảo tất cả cột trong wallet_transactions tồn tại
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'deposit';
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS amount BIGINT DEFAULT 0;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS account_holder TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS rejected_by TEXT;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- 3. BẢNG NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  content TEXT,
  type TEXT DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- 4. BẢNG MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  sender TEXT NOT NULL DEFAULT 'user',
  text TEXT NOT NULL DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  created_date TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender TEXT DEFAULT 'user';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

-- 5. BẢNG INVESTMENT_PROJECTS
CREATE TABLE IF NOT EXISTS public.investment_projects (
  id TEXT PRIMARY KEY,
  title TEXT,
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

ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'VinHomes';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS price_per_m2 NUMERIC DEFAULT 0;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS price_str TEXT DEFAULT '';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS rate TEXT DEFAULT '0.5%/ngày';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS annual_yield NUMERIC DEFAULT 0.5;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS area TEXT DEFAULT '';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS progress NUMERIC DEFAULT 80;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS min_amount NUMERIC DEFAULT 1000000;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '30 ngày';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS scale TEXT DEFAULT '';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.investment_projects ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();

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
