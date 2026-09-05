-- ============================================================================
-- VinClub — Baseline migration (dựng lại TOÀN BỘ schema thật đang chạy trên
-- Supabase project eaugjhjhyeginnuayxik, tại thời điểm 2026-09-01).
--
-- File này được TỰ ĐỘNG DỰNG LẠI bằng cách truy vấn trực tiếp catalog
-- Postgres (information_schema/pg_catalog) qua Supabase MCP - không dùng
-- `supabase db pull` vì máy chưa cài Docker Desktop (bắt buộc với CLI để
-- chạy shadow database). Baseline này phản ánh ĐÚNG schema thật, không phải
-- suy luận lại từ các file supabase_*.sql rời rạc cũ (vốn có thể đã lệch so
-- với thực tế sau nhiều lần chỉnh sửa trực tiếp qua SQL Editor / MCP).
--
-- Migration này đã được coi là "đã áp dụng" trên project thật (lịch sử 41
-- migration cũ đã được `supabase migration repair --status reverted` để dọn
-- sạch, baseline này thay thế toàn bộ làm điểm bắt đầu theo dõi local mới).
-- KHÔNG chạy lại file này trên chính project eaugjhjhyeginnuayxik - chỉ dùng
-- khi cần dựng lại schema từ đầu trên 1 project Supabase MỚI, trống.
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;

-- ─── Tables (chỉ cột, chưa có ràng buộc - thêm ở phần sau để tránh phụ thuộc thứ tự) ───

CREATE TABLE public.audit_logs (
  id text NOT NULL,
  action text DEFAULT ''::text,
  tx_code text,
  amount numeric,
  user_id text,
  user_name text DEFAULT ''::text,
  admin_email text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.bank_accounts (
  id text NOT NULL,
  user_id text,
  bank_name text DEFAULT ''::text,
  bank_code text DEFAULT ''::text,
  account_number text DEFAULT ''::text,
  account_holder text DEFAULT ''::text,
  is_default boolean DEFAULT false,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.casino_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  game_slug text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  total_wagered bigint NOT NULL DEFAULT 0,
  bets jsonb NOT NULL DEFAULT '{}'::jsonb,
  round_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.casino_secure_config (
  game_slug text NOT NULL,
  forced_outcome text NOT NULL DEFAULT 'auto'::text,
  odds205 boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE public.investment_projects (
  id text NOT NULL,
  title text,
  name text,
  category text DEFAULT 'VinHomes'::text,
  location text DEFAULT ''::text,
  image text,
  price_per_m2 numeric DEFAULT 0,
  price_str text DEFAULT ''::text,
  rate text DEFAULT '0.5%/ngày'::text,
  annual_yield numeric DEFAULT 0.5,
  area text DEFAULT ''::text,
  progress numeric DEFAULT 80,
  min_amount numeric DEFAULT 1000000,
  duration text DEFAULT '30 ngày'::text,
  scale text DEFAULT ''::text,
  is_active boolean DEFAULT true,
  description text DEFAULT ''::text,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb,
  total_term_interest_rate numeric NOT NULL DEFAULT 0,
  term_duration_minutes integer NOT NULL DEFAULT 43200,
  stock_symbol text,
  daily_change_percent numeric,
  legal_status text,
  growth_history text,
  monthly_transactions text,
  tag text
);

CREATE TABLE public.lucky_wheel_spins (
  user_id text NOT NULL,
  spin_date date NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id text NOT NULL,
  thread_id uuid,
  sender_id uuid,
  body text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ai_summary text,
  ai_summary_created_at timestamp with time zone,
  user_id text,
  sender text DEFAULT 'user'::text,
  text text DEFAULT ''::text,
  images jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  created_date timestamp with time zone DEFAULT now(),
  content text DEFAULT ''::text,
  attachments jsonb DEFAULT '[]'::jsonb,
  conversation_id text,
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.messen (
  id text NOT NULL,
  sender text NOT NULL DEFAULT 'user'::text,
  content text,
  attachments jsonb DEFAULT '[]'::jsonb,
  conversation_id text NOT NULL,
  created_by_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.news (
  id text NOT NULL,
  title text DEFAULT ''::text,
  excerpt text DEFAULT ''::text,
  category text DEFAULT ''::text,
  author text DEFAULT 'Ban Biên Tập VinClub'::text,
  image text DEFAULT ''::text,
  featured boolean DEFAULT false,
  tags jsonb DEFAULT '[]'::jsonb,
  sections jsonb DEFAULT '[]'::jsonb,
  date text DEFAULT ''::text,
  time text DEFAULT ''::text,
  views text DEFAULT '0'::text,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.notifications (
  id text NOT NULL,
  user_id text,
  title text,
  content text,
  type text DEFAULT 'admin'::text,
  is_read boolean DEFAULT false,
  created_date timestamp with time zone DEFAULT now(),
  image text,
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.savings_goals (
  id text NOT NULL,
  user_id text NOT NULL,
  title text NOT NULL DEFAULT ''::text,
  icon text NOT NULL DEFAULT 'target'::text,
  color text NOT NULL DEFAULT '#948154'::text,
  target_amount bigint NOT NULL DEFAULT 0,
  current_amount bigint NOT NULL DEFAULT 0,
  target_date date,
  status text NOT NULL DEFAULT 'active'::text,
  created_date timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE public.signatures (
  id text NOT NULL,
  user_id text,
  type text DEFAULT 'draw'::text,
  content text DEFAULT ''::text,
  label text DEFAULT ''::text,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.thread_members (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ai_summary text,
  ai_summary_created_at timestamp with time zone
);

CREATE TABLE public.transactions (
  id text NOT NULL,
  user_id text,
  user_email text DEFAULT ''::text,
  user_name text DEFAULT ''::text,
  project_id text,
  project_name text DEFAULT ''::text,
  project_title text DEFAULT ''::text,
  category text DEFAULT ''::text,
  amount numeric DEFAULT 0,
  shares numeric,
  method text DEFAULT ''::text,
  rate numeric,
  duration_days numeric,
  profit numeric DEFAULT 0,
  total numeric DEFAULT 0,
  status text DEFAULT 'completed'::text,
  payout_status text,
  contract_status text DEFAULT 'pending'::text,
  signature_type text,
  signature_content text,
  note text DEFAULT ''::text,
  created_date timestamp with time zone DEFAULT now(),
  extra jsonb DEFAULT '{}'::jsonb,
  matures_at timestamp with time zone,
  interest_status text NOT NULL DEFAULT 'pending'::text
);

CREATE TABLE public.users (
  id text NOT NULL,
  email text,
  identifier text,
  name text DEFAULT 'Hội viên VinClub'::text,
  full_name text DEFAULT 'Hội viên VinClub'::text,
  phone text DEFAULT ''::text,
  role text DEFAULT 'user'::text,
  balance bigint DEFAULT 0,
  total_deposited bigint DEFAULT 0,
  membership_tier text DEFAULT 'VIP 1 - Gold'::text,
  vip_level text DEFAULT 'VIP 1'::text,
  is_locked boolean DEFAULT false,
  avatar_url text DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde'::text,
  bank_name text DEFAULT ''::text,
  account_number text DEFAULT ''::text,
  account_holder text DEFAULT ''::text,
  referral_code text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  last_active timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  balance_version bigint DEFAULT 0,
  username text,
  id_card_number text,
  daily_interest_enabled boolean NOT NULL DEFAULT false,
  last_interest_credited_date date
);

CREATE TABLE public.wallet_transactions (
  id text NOT NULL,
  user_id text,
  type text DEFAULT 'deposit'::text,
  amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed'::text,
  code text,
  description text,
  bank_name text,
  account_number text,
  account_holder text,
  rejection_reason text,
  approved_at timestamp with time zone,
  approved_by text,
  rejected_at timestamp with time zone,
  rejected_by text,
  created_date timestamp with time zone DEFAULT now(),
  category text,
  note text
);
-- ─── Primary keys ───────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.casino_rounds ADD CONSTRAINT casino_rounds_pkey PRIMARY KEY (id);
ALTER TABLE public.casino_secure_config ADD CONSTRAINT casino_secure_config_pkey PRIMARY KEY (game_slug);
ALTER TABLE public.investment_projects ADD CONSTRAINT investment_projects_pkey PRIMARY KEY (id);
ALTER TABLE public.lucky_wheel_spins ADD CONSTRAINT lucky_wheel_spins_pkey PRIMARY KEY (user_id, spin_date);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messen ADD CONSTRAINT messen_pkey PRIMARY KEY (id);
ALTER TABLE public.news ADD CONSTRAINT news_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.signatures ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);
ALTER TABLE public.thread_members ADD CONSTRAINT thread_members_pkey PRIMARY KEY (thread_id, user_id);
ALTER TABLE public.threads ADD CONSTRAINT threads_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);

-- ─── Unique constraints ─────────────────────────────────────────────────────
ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);

-- ─── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE public.casino_rounds ADD CONSTRAINT casino_rounds_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lucky_wheel_spins ADD CONSTRAINT lucky_wheel_spins_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE;
ALTER TABLE public.thread_members ADD CONSTRAINT thread_members_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE;

-- ─── Check constraints ──────────────────────────────────────────────────────
ALTER TABLE public.casino_rounds ADD CONSTRAINT casino_rounds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'settled'::text])));
ALTER TABLE public.casino_secure_config ADD CONSTRAINT casino_secure_config_forced_outcome_check CHECK ((forced_outcome = ANY (ARRAY['auto'::text, 'player'::text, 'banker'::text, 'tie'::text, 'tiger'::text])));
ALTER TABLE public.messen ADD CONSTRAINT messen_sender_check CHECK ((sender = ANY (ARRAY['user'::text, 'admin'::text])));
ALTER TABLE public.savings_goals ADD CONSTRAINT savings_goals_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_interest_status_check CHECK ((interest_status = ANY (ARRAY['pending'::text, 'completed'::text])));

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_date DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_bank_accounts_user ON public.bank_accounts USING btree (user_id);
CREATE UNIQUE INDEX casino_rounds_one_pending_per_user_game ON public.casino_rounds USING btree (user_id, game_slug) WHERE (status = 'pending'::text);
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);
CREATE INDEX idx_messages_user ON public.messages USING btree (user_id);
CREATE INDEX messages_thread_ai_summary_created_at_idx ON public.messages USING btree (thread_id, ai_summary_created_at);
CREATE INDEX messages_thread_created_at_idx ON public.messages USING btree (thread_id, created_at);
CREATE INDEX idx_messen_conversation ON public.messen USING btree (conversation_id);
CREATE INDEX idx_messen_created_by ON public.messen USING btree (created_by_id);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_savings_goals_user_id ON public.savings_goals USING btree (user_id);
CREATE INDEX idx_signatures_user ON public.signatures USING btree (user_id);
CREATE INDEX thread_members_user_idx ON public.thread_members USING btree (user_id);
CREATE INDEX threads_ai_summary_created_at_idx ON public.threads USING btree (ai_summary_created_at);
CREATE INDEX idx_transactions_created ON public.transactions USING btree (created_date DESC);
CREATE INDEX idx_transactions_pending_maturity ON public.transactions USING btree (matures_at) WHERE ((payout_status IS DISTINCT FROM 'paid'::text) AND (status IS DISTINCT FROM 'completed_payout'::text));
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE UNIQUE INDEX users_username_lower_unique_idx ON public.users USING btree (lower(username));
CREATE INDEX idx_wallet_tx_created ON public.wallet_transactions USING btree (created_date DESC);
CREATE INDEX idx_wallet_tx_status ON public.wallet_transactions USING btree (status);
CREATE INDEX idx_wallet_tx_type ON public.wallet_transactions USING btree (type);
CREATE INDEX idx_wallet_tx_user_id ON public.wallet_transactions USING btree (user_id);

-- ─── Functions (RPC + trigger functions) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public._baicao_draw_card()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  ranks text[] := array['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  vals int[] := array[1,2,3,4,5,6,7,8,9,10,10,10,10];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object('rank', ranks[r_idx], 'value', vals[r_idx], 'suit', suits[s_idx], 'is_red', reds[s_idx]);
end;
$function$;


CREATE OR REPLACE FUNCTION public._baicao_hand_score(hand jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce((select sum((c->>'value')::int) from jsonb_array_elements(hand) c), 0) % 10;
$function$;


CREATE OR REPLACE FUNCTION public._baicao_is_cao(hand jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    coalesce((select bool_and((c->>'rank') in ('J','Q','K')) from jsonb_array_elements(hand) c), false)
    or coalesce((select bool_and((c->>'rank') = 'A') from jsonb_array_elements(hand) c), false);
$function$;


CREATE OR REPLACE FUNCTION public._tb_deal_card()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  ranks text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  vals int[] := array[2,3,4,5,6,7,8,9,0,0,0,0,1];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object(
    'rank', ranks[r_idx], 'value', vals[r_idx],
    'suit', suits[s_idx], 'is_red', reds[s_idx]
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public._tb_score(hand jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce((select sum((c->>'value')::int) from jsonb_array_elements(hand) c), 0) % 10;
$function$;


CREATE OR REPLACE FUNCTION public._xito_draw_card()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  ranks text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  vals int[] := array[2,3,4,5,6,7,8,9,10,11,12,13,14];
  suits text[] := array['♠','♥','♦','♣'];
  reds boolean[] := array[false,true,true,false];
  r_idx int := floor(random()*13)::int + 1;
  s_idx int := floor(random()*4)::int + 1;
begin
  return jsonb_build_object('rank', ranks[r_idx], 'value', vals[r_idx], 'suit', suits[s_idx], 'is_red', reds[s_idx]);
end;
$function$;


CREATE OR REPLACE FUNCTION public._xito_evaluate(hand jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v0 int; v1 int; v2 int;
  is_flush boolean;
  is_normal_straight boolean;
  is_ace_low_straight boolean;
  is_straight boolean;
  is_three boolean;
  is_pair boolean;
  pair_val int;
  total_points int;
  point_score int;
  rank_name text;
  score int;
  multiplier numeric;
begin
  select a[1], a[2], a[3] into v0, v1, v2
    from (select array_agg((c->>'value')::int order by (c->>'value')::int desc) as a from jsonb_array_elements(hand) c) t;

  select count(distinct c->>'suit') = 1 into is_flush from jsonb_array_elements(hand) c;

  is_normal_straight := (v0 - 1 = v1) and (v1 - 1 = v2);
  is_ace_low_straight := (v0 = 14 and v1 = 3 and v2 = 2);
  is_straight := is_normal_straight or is_ace_low_straight;
  is_three := (v0 = v1) and (v1 = v2);
  is_pair := (v0 = v1) or (v1 = v2) or (v0 = v2);

  if is_straight and is_flush then
    rank_name := 'THÙNG PHÁ SẢNH'; score := 6000 + v0; multiplier := 5;
  elsif is_three then
    rank_name := 'SÁM CỔ (BA CÂY)'; score := 5000 + v0; multiplier := 4;
  elsif is_straight then
    score := 4000 + (case when is_ace_low_straight then 3 else v0 end);
    rank_name := 'SẢNH'; multiplier := 3;
  elsif is_flush then
    rank_name := 'THÙNG'; score := 3000 + v0*10 + v1; multiplier := 2;
  elsif is_pair then
    pair_val := case when v0 = v1 then v0 when v1 = v2 then v1 else v0 end;
    rank_name := 'ĐÔI'; score := 2000 + pair_val*10; multiplier := 1.5;
  else
    select sum(case when c->>'rank' in ('J','Q','K') then 10 when c->>'rank' = 'A' then 1 else (c->>'rank')::int end)
      into total_points from jsonb_array_elements(hand) c;
    point_score := total_points % 10;
    rank_name := case when point_score = 0 then '10 ĐIỂM' else point_score || ' ĐIỂM' end;
    score := 1000 + point_score*100 + v0;
    multiplier := 1;
  end if;

  return jsonb_build_object('rank_name', rank_name, 'score', score, 'multiplier', multiplier);
end;
$function$;


CREATE OR REPLACE FUNCTION public.check_username_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.username IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(username) = lower(NEW.username)
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Tên đăng nhập "%" đã được sử dụng, vui lòng chọn tên khác.', NEW.username
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.compute_transaction_interest()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_project record;
begin
  if new.project_id is not null then
    select * into v_project from public.investment_projects where id = new.project_id;
  end if;

  if v_project.id is null then
    raise exception 'compute_transaction_interest: invalid or missing project_id';
  end if;

  new.rate := v_project.total_term_interest_rate;
  new.profit := round(coalesce(new.amount, 0) * v_project.total_term_interest_rate / 100);
  new.total := coalesce(new.amount, 0) + new.profit;
  new.created_date := coalesce(new.created_date, now());
  new.matures_at := new.created_date + make_interval(mins => v_project.term_duration_minutes);
  new.interest_status := 'pending';
  new.payout_status := coalesce(new.payout_status, 'pending');
  new.status := coalesce(new.status, 'completed');

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.contribute_to_savings_goal(p_goal_id text, p_amount bigint)
 RETURNS savings_goals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_goal public.savings_goals;
  v_uid text := auth.uid()::text;
  v_new_amount bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_goal FROM public.savings_goals WHERE id = p_goal_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'goal not found or not owned by caller';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_uid AND balance >= p_amount AND is_locked = false FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient balance or account locked';
  END IF;

  PERFORM set_config('app.trusted_balance_rpc', 'on', true);
  UPDATE public.users SET balance = balance - p_amount, balance_version = balance_version + 1 WHERE id = v_uid;

  v_new_amount := v_goal.current_amount + p_amount;
  UPDATE public.savings_goals
  SET current_amount = v_new_amount,
      status = CASE WHEN v_new_amount >= target_amount AND target_amount > 0 THEN 'completed' ELSE 'active' END,
      completed_at = CASE
        WHEN v_new_amount >= target_amount AND target_amount > 0 AND v_goal.status <> 'completed' THEN now()
        ELSE v_goal.completed_at
      END
  WHERE id = p_goal_id
  RETURNING * INTO v_goal;

  RETURN v_goal;
END;
$function$;


CREATE OR REPLACE FUNCTION public.credit_daily_interest_batch()
 RETURNS TABLE(user_id text, credited_amount bigint, new_balance bigint, tier_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vn_date date;
  v_vn_hour numeric;
BEGIN
  -- Mọi mốc "ngày" và "giờ" trong hàm này tính theo giờ Việt Nam
  -- (Asia/Ho_Chi_Minh, UTC+7, không có DST) - KHÔNG dùng CURRENT_DATE/now()
  -- mặc định vì Postgres server chạy theo UTC, lệch 7 tiếng so với giờ VN sẽ
  -- khiến "ngày" đổi sai thời điểm và mốc 9h sáng bị tính nhầm.
  v_vn_date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_vn_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'));

  -- Trước 9h sáng giờ VN: chưa tới giờ cộng lãi hôm nay, không làm gì cả.
  -- Hàm này được server gọi định kỳ (server.ts, mỗi 15 phút) nên tự thoát
  -- sớm ở đây an toàn - không cần cron riêng theo giờ VN phía server.
  IF v_vn_hour < 9 THEN
    RETURN;
  END IF;

  PERFORM set_config('app.trusted_balance_rpc', 'on', true);

  RETURN QUERY
  WITH eligible AS (
    SELECT u.id, u.balance,
      CASE
        WHEN u.membership_tier ILIKE '%diamond%' OR u.membership_tier ILIKE '%kim cương%' THEN 0.012
        WHEN u.membership_tier ILIKE '%platinum%' OR u.membership_tier ILIKE '%bạch kim%' THEN 0.008
        WHEN u.membership_tier ILIKE '%gold%' OR u.membership_tier ILIKE '%vàng%' THEN 0.004
        ELSE 0.002
      END AS rate
    FROM public.users u
    WHERE u.daily_interest_enabled = true
      AND u.is_locked = false
      AND (u.last_interest_credited_date IS NULL OR u.last_interest_credited_date < v_vn_date)
    FOR UPDATE OF u SKIP LOCKED
  ),
  computed AS (
    SELECT id, rate, FLOOR(balance * rate)::bigint AS amount
    FROM eligible
    WHERE FLOOR(balance * rate)::bigint > 0
  ),
  updated AS (
    UPDATE public.users u
    SET balance = u.balance + c.amount,
        balance_version = u.balance_version + 1,
        last_interest_credited_date = v_vn_date
    FROM computed c
    WHERE u.id = c.id
    RETURNING u.id, c.amount AS credited_amount, u.balance AS new_balance, c.rate AS tier_rate
  ),
  logged AS (
    INSERT INTO public.wallet_transactions (id, user_id, type, amount, status, category, note, code, created_date)
    SELECT
      'wtx_int_' || up.id || '_' || to_char(v_vn_date, 'YYYYMMDD'),
      up.id,
      'bonus',
      up.credited_amount,
      'approved',
      'Lãi Hàng Ngày Theo Cấp VIP',
      'Lãi ngày ' || to_char(v_vn_date, 'DD/MM/YYYY') || ' (' || (up.tier_rate * 100) || '%/ngày, cộng lúc 9h sáng giờ VN) [ref:interest:' || up.id || ':' || to_char(v_vn_date, 'YYYYMMDD') || ']',
      'LAI' || to_char(v_vn_date, 'YYYYMMDD') || upper(right(up.id, 6)),
      now()
    FROM updated up
    ON CONFLICT (id) DO NOTHING
  )
  SELECT * FROM updated;
END;
$function$;


CREATE OR REPLACE FUNCTION public.delete_savings_goal(p_goal_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_goal public.savings_goals;
  v_uid text := auth.uid()::text;
BEGIN
  SELECT * INTO v_goal FROM public.savings_goals WHERE id = p_goal_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'goal not found or not owned by caller';
  END IF;

  IF v_goal.current_amount > 0 THEN
    PERFORM set_config('app.trusted_balance_rpc', 'on', true);
    UPDATE public.users SET balance = balance + v_goal.current_amount, balance_version = balance_version + 1 WHERE id = v_uid;
  END IF;

  DELETE FROM public.savings_goals WHERE id = p_goal_id;
  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (
    id, email, identifier, name, full_name, phone, role, balance,
    membership_tier, avatar_url, created_at, last_active
  ) VALUES (
    NEW.id, NEW.email, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user', -- role is never taken from client-controlled user_metadata; always starts as plain 'user'
    0,      -- balance is never taken from client-controlled user_metadata; always starts at 0
    COALESCE(NEW.raw_user_meta_data->>'membership_tier', 'VIP 1 - Gold'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde'),
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_active = NOW(),
    email = EXCLUDED.email;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id text, p_delta bigint, p_total_deposited_delta bigint DEFAULT 0)
 RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user_id is distinct from auth.uid()::text and not public.is_admin() then
    raise exception 'not authorized to modify balance for this user';
  end if;

  if p_user_id = auth.uid()::text and not public.is_admin() then
    if exists (select 1 from public.users where id = p_user_id and is_locked = true) then
      raise exception 'account is locked';
    end if;
    if p_delta > 0 then
      raise exception 'not authorized to credit your own balance directly';
    end if;
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);

  return query
  update public.users
  set
    balance = greatest(0, public.users.balance + p_delta),
    total_deposited = public.users.total_deposited + p_total_deposited_delta,
    balance_version = public.users.balance_version + 1,
    last_active = now()
  where id = p_user_id
  returning public.users.balance, public.users.total_deposited, public.users.balance_version;
end;
$function$;


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT role IN ('admin','ADMIN') FROM public.users WHERE id = auth.uid()::text), false)
    OR lower(COALESCE((auth.jwt() ->> 'email'), '')) = ANY (ARRAY['nclong1976@gmail.com','leo1102@vinclub.com']);
$function$;


CREATE OR REPLACE FUNCTION public.place_tiger_baccarat_bet(p_game_slug text, p_bets jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_total bigint := 0;
  v_balance bigint;
  v_round_id uuid;
  v_bets jsonb := '{}'::jsonb;
  v_allowed_keys text[] := array['player','banker','tie','tiger','player_pair','banker_pair'];
  k text;
  v_amt bigint;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_game_slug not in ('tiger-baccarat', 'baccarat-long-ho') then
    raise exception 'invalid game';
  end if;
  if exists (select 1 from public.users where id = v_user_id and is_locked = true) then
    raise exception 'account is locked';
  end if;

  for k in select jsonb_object_keys(coalesce(p_bets, '{}'::jsonb)) loop
    if k = any(v_allowed_keys) then
      v_amt := greatest(0, coalesce((p_bets->>k)::bigint, 0));
      if v_amt > 0 then
        v_bets := v_bets || jsonb_build_object(k, v_amt);
        v_total := v_total + v_amt;
      end if;
    end if;
  end loop;

  if v_total <= 0 then
    raise exception 'no bets placed';
  end if;

  if exists (select 1 from public.casino_rounds where user_id = v_user_id and game_slug = p_game_slug and status = 'pending') then
    raise exception 'a round is already pending for this game';
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
    set balance = balance - v_total, balance_version = balance_version + 1, last_active = now()
    where id = v_user_id and balance >= v_total
    returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient balance';
  end if;

  insert into public.casino_rounds (user_id, game_slug, status, total_wagered, bets)
    values (v_user_id, p_game_slug, 'pending', v_total, v_bets)
    returning id into v_round_id;

  return v_round_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.play_baicao_round(p_bet_amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_player jsonb;
  v_dealer jsonb;
  v_player_cao boolean;
  v_dealer_cao boolean;
  v_player_score int;
  v_dealer_score int;
  v_result text;
  v_payout bigint := 0;
  v_balance bigint;
  v_version bigint;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_bet_amount not in (10000, 50000, 100000, 500000) then
    raise exception 'invalid bet amount';
  end if;
  if exists (select 1 from public.users where id = v_user_id and is_locked = true) then
    raise exception 'account is locked';
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
    set balance = balance - p_bet_amount, balance_version = balance_version + 1, last_active = now()
    where id = v_user_id and balance >= p_bet_amount
    returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient balance';
  end if;

  v_player := jsonb_build_array(public._baicao_draw_card(), public._baicao_draw_card(), public._baicao_draw_card());
  v_dealer := jsonb_build_array(public._baicao_draw_card(), public._baicao_draw_card(), public._baicao_draw_card());
  v_player_cao := public._baicao_is_cao(v_player);
  v_dealer_cao := public._baicao_is_cao(v_dealer);
  v_player_score := public._baicao_hand_score(v_player);
  v_dealer_score := public._baicao_hand_score(v_dealer);

  if v_player_cao and v_dealer_cao then
    v_result := 'tie';
  elsif v_player_cao then
    v_result := 'win';
  elsif v_dealer_cao then
    v_result := 'lose';
  elsif v_player_score > v_dealer_score then
    v_result := 'win';
  elsif v_player_score < v_dealer_score then
    v_result := 'lose';
  else
    v_result := 'tie';
  end if;

  if v_result = 'win' then
    v_payout := case when v_player_cao then p_bet_amount * 3 else p_bet_amount * 2 end;
  elsif v_result = 'tie' then
    v_payout := p_bet_amount;
  else
    v_payout := 0;
  end if;

  if v_payout > 0 then
    perform set_config('app.trusted_balance_rpc', 'on', true);
    update public.users
      set balance = greatest(0, balance + v_payout), balance_version = balance_version + 1, last_active = now()
      where id = v_user_id
      returning balance, balance_version into v_balance, v_version;
  else
    select balance, balance_version into v_balance, v_version from public.users where id = v_user_id;
  end if;

  return jsonb_build_object(
    'player_hand', v_player,
    'dealer_hand', v_dealer,
    'player_score', v_player_score,
    'dealer_score', v_dealer_score,
    'player_cao', v_player_cao,
    'dealer_cao', v_dealer_cao,
    'result', v_result,
    'bet_amount', p_bet_amount,
    'payout', v_payout,
    'balance', v_balance,
    'balance_version', v_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.process_withdrawal(p_tx_id text, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS wallet_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx public.wallet_transactions;
  v_admin_email text;
  v_title text;
  v_content text;
  v_refund_code text;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_ACTION';
  end if;

  v_admin_email := coalesce(auth.jwt() ->> 'email', 'admin');

  select * into v_tx from public.wallet_transactions
  where id = p_tx_id and status = 'pending' and type = 'withdraw'
  for update;

  if not found then
    raise exception 'ALREADY_PROCESSED';
  end if;

  if p_action = 'approve' then
    update public.wallet_transactions set
      status = 'completed', approved_at = now(), approved_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    v_title := 'Biến động số dư: -' || v_tx.amount || ' VNĐ';
    v_content := 'Yêu cầu rút tiền mã ' || coalesce(v_tx.code, v_tx.id) ||
      ' đã được Quản trị viên phê duyệt thành công. Tiền đã chuyển về ngân hàng ' ||
      coalesce(v_tx.bank_name, 'đối tác') || ' (' || coalesce(v_tx.account_number, '') || ').';
  else
    update public.wallet_transactions set
      status = 'rejected', rejection_reason = p_reason, rejected_at = now(), rejected_by = v_admin_email
      where id = p_tx_id
      returning * into v_tx;

    -- Hoàn tiền CÙNG transaction với đổi status - 1 trong 2 lỗi thì cả 2 rollback
    perform public.increment_user_balance(v_tx.user_id, v_tx.amount, 0);

    -- Dòng lịch sử ví riêng cho khoản hoàn tiền, giống hành vi client cũ
    v_refund_code := 'REF' || to_char(clock_timestamp(), 'FMHH24MISS') || substr(v_tx.id, -4);
    insert into public.wallet_transactions(id, user_id, type, amount, status, description, code)
    values (
      gen_random_uuid()::text, v_tx.user_id, 'deposit', v_tx.amount, 'completed',
      'Hoàn tiền do lệnh rút ' || coalesce(v_tx.code, v_tx.id) || ' bị từ chối: ' || coalesce(p_reason, ''),
      v_refund_code
    );

    v_title := 'Lệnh rút tiền bị từ chối';
    v_content := 'Lệnh rút ' || v_tx.amount || ' VNĐ (Mã ' || coalesce(v_tx.code, v_tx.id) ||
      ') bị từ chối. Lý do: ' || coalesce(p_reason, '') || '. Số tiền đã được hoàn trả nguyên vẹn vào ví VinClub.';
  end if;

  insert into public.notifications(id, user_id, title, content, type, is_read)
  values (gen_random_uuid()::text, v_tx.user_id, v_title, v_content, 'withdraw', false);

  insert into public.audit_logs(id, action, tx_code, amount, user_id, admin_email, notes)
  values (
    gen_random_uuid()::text,
    case when p_action = 'approve' then 'APPROVE_WITHDRAWAL' else 'REJECT_WITHDRAWAL' end,
    coalesce(v_tx.code, v_tx.id), v_tx.amount, v_tx.user_id, v_admin_email, v_content
  );

  return v_tx;
end;
$function$;


CREATE OR REPLACE FUNCTION public.protect_privileged_user_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin()
     AND current_setting('app.trusted_balance_rpc', true) IS DISTINCT FROM 'on' THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    NEW.total_deposited := OLD.total_deposited;
    NEW.balance_version := OLD.balance_version;
    NEW.is_locked := OLD.is_locked;
    NEW.membership_tier := OLD.membership_tier;
    NEW.vip_level := OLD.vip_level;
  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.protect_transaction_financial_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() and current_setting('app.trusted_balance_rpc', true) is distinct from 'on' then
    new.user_id := old.user_id;
    new.amount := old.amount;
    new.profit := old.profit;
    new.total := old.total;
    new.rate := old.rate;
    new.duration_days := old.duration_days;
    new.shares := old.shares;
    new.payout_status := old.payout_status;
    new.status := old.status;
    new.contract_status := old.contract_status;
    new.project_id := old.project_id;
    new.project_name := old.project_name;
    new.project_title := old.project_title;
    new.created_date := old.created_date;
    new.matures_at := old.matures_at;
    new.interest_status := old.interest_status;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.raise_xitobala_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_round record;
  v_raise bigint := 50000;
  v_balance bigint;
  v_new_pot bigint;
  v_new_bet bigint;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;

  select * into v_round from public.casino_rounds
    where id = p_round_id and user_id = v_user_id and game_slug = 'xi-to-ba-la' and status = 'pending'
    for update;
  if not found then
    raise exception 'round not found or already settled';
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
    set balance = balance - v_raise, balance_version = balance_version + 1, last_active = now()
    where id = v_user_id and balance >= v_raise
    returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient balance';
  end if;

  v_new_pot := (v_round.round_state->>'pot')::bigint + v_raise * 3;
  v_new_bet := (v_round.round_state->>'bet_amount')::bigint + v_raise;

  update public.casino_rounds
    set round_state = round_state || jsonb_build_object('pot', v_new_pot, 'bet_amount', v_new_bet),
        total_wagered = total_wagered + v_raise,
        updated_at = now()
    where id = p_round_id;

  return jsonb_build_object('pot', v_new_pot, 'bet_amount', v_new_bet, 'balance', v_balance);
end;
$function$;


CREATE OR REPLACE FUNCTION public.reconcile_my_stale_casino_round(p_game_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_round record;
  v_balance bigint;
  v_version bigint;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;

  select * into v_round from public.casino_rounds
    where user_id = v_user_id and game_slug = p_game_slug and status = 'pending'
      and created_at < now() - interval '10 minutes'
    for update;

  if not found then
    return jsonb_build_object('refunded', false);
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
    set balance = greatest(0, balance + v_round.total_wagered), balance_version = balance_version + 1, last_active = now()
    where id = v_user_id
    returning balance, balance_version into v_balance, v_version;

  update public.casino_rounds set status = 'settled', updated_at = now(),
    round_state = round_state || jsonb_build_object('abandoned_refund', v_round.total_wagered)
    where id = v_round.id;

  return jsonb_build_object('refunded', true, 'amount', v_round.total_wagered, 'balance', v_balance, 'balance_version', v_version);
end;
$function$;


CREATE OR REPLACE FUNCTION public.resolve_project_maturity_payout(p_tx_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_tx record;
  v_payout bigint;
  v_new_balance bigint;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then
    return jsonb_build_object('paid', false, 'reason', 'not_found');
  end if;

  if v_tx.user_id is distinct from v_user_id and not public.is_admin() then
    raise exception 'not authorized for this transaction';
  end if;

  if v_tx.payout_status = 'paid' or v_tx.status = 'completed_payout' then
    return jsonb_build_object('paid', false, 'reason', 'already_paid');
  end if;

  if v_tx.matures_at is null or now() < v_tx.matures_at then
    return jsonb_build_object('paid', false, 'reason', 'not_matured');
  end if;

  v_payout := round(coalesce(nullif(v_tx.total, 0), coalesce(v_tx.amount, 0) + coalesce(v_tx.profit, 0)));
  if v_payout <= 0 then
    return jsonb_build_object('paid', false, 'reason', 'zero_payout');
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);

  update public.transactions
    set status = 'completed_payout', payout_status = 'paid', interest_status = 'completed'
    where id = p_tx_id;

  insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
  values (
    gen_random_uuid()::text, v_tx.user_id, 'deposit', v_payout, 'approved',
    'Đáo Hạn Dự Án',
    'Đáo hạn dự án "' || coalesce(v_tx.project_title, '') || '" - Hoàn vốn & trả lãi [ref:' || p_tx_id || ']'
  );

  update public.users
    set balance = greatest(0, balance + v_payout),
        balance_version = balance_version + 1,
        last_active = now()
    where id = v_tx.user_id
    returning balance, balance_version into v_new_balance, v_new_version;

  return jsonb_build_object(
    'paid', true,
    'payout_amount', v_payout,
    'project_title', v_tx.project_title,
    'balance', v_new_balance,
    'balance_version', v_new_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.resolve_tiger_baccarat_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_round record;
  v_game_slug text;
  v_cfg record;
  v_forced text;
  v_odds205 boolean;
  v_phand jsonb;
  v_bhand jsonb;
  v_pscore int;
  v_bscore int;
  v_p3 jsonb;
  v_p3val int;
  v_bdraws boolean;
  v_coin double precision;
  v_bet_player bigint;
  v_bet_banker bigint;
  v_bet_tie bigint;
  v_bet_tiger bigint;
  v_bet_pp bigint;
  v_bet_bp bigint;
  v_winners text[] := array[]::text[];
  v_summary text[] := array[]::text[];
  v_payout bigint := 0;
  v_pay bigint;
  v_new_balance bigint;
  v_new_version bigint;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_round from public.casino_rounds
    where id = p_round_id and user_id = v_user_id and status = 'pending'
      and game_slug in ('tiger-baccarat', 'baccarat-long-ho')
    for update;
  if not found then
    raise exception 'round not found or already settled';
  end if;

  v_game_slug := v_round.game_slug;
  v_bet_player := coalesce((v_round.bets->>'player')::bigint, 0);
  v_bet_banker := coalesce((v_round.bets->>'banker')::bigint, 0);
  v_bet_tie := coalesce((v_round.bets->>'tie')::bigint, 0);
  v_bet_tiger := coalesce((v_round.bets->>'tiger')::bigint, 0);
  v_bet_pp := coalesce((v_round.bets->>'player_pair')::bigint, 0);
  v_bet_bp := coalesce((v_round.bets->>'banker_pair')::bigint, 0);

  select * into v_cfg from public.casino_secure_config where game_slug = v_game_slug for update;
  v_forced := coalesce(v_cfg.forced_outcome, 'auto');
  v_odds205 := coalesce(v_cfg.odds205, false);
  if v_forced <> 'auto' then
    update public.casino_secure_config set forced_outcome = 'auto', updated_at = now()
      where game_slug = v_game_slug;
  end if;

  v_phand := jsonb_build_array(public._tb_deal_card(), public._tb_deal_card());
  v_bhand := jsonb_build_array(public._tb_deal_card(), public._tb_deal_card());
  v_pscore := public._tb_score(v_phand);
  v_bscore := public._tb_score(v_bhand);

  if v_pscore < 8 and v_bscore < 8 then
    if v_pscore <= 5 then
      v_p3 := public._tb_deal_card();
      v_phand := v_phand || jsonb_build_array(v_p3);
      v_pscore := public._tb_score(v_phand);
    end if;

    if v_p3 is null then
      if v_bscore <= 5 then
        v_bhand := v_bhand || jsonb_build_array(public._tb_deal_card());
        v_bscore := public._tb_score(v_bhand);
      end if;
    else
      v_p3val := (v_p3->>'value')::int;
      v_bdraws := false;
      if v_bscore <= 2 then v_bdraws := true;
      elsif v_bscore = 3 and v_p3val <> 8 then v_bdraws := true;
      elsif v_bscore = 4 and v_p3val in (2,3,4,5,6,7) then v_bdraws := true;
      elsif v_bscore = 5 and v_p3val in (4,5,6,7) then v_bdraws := true;
      elsif v_bscore = 6 and v_p3val in (6,7) then v_bdraws := true;
      end if;
      if v_bdraws then
        v_bhand := v_bhand || jsonb_build_array(public._tb_deal_card());
        v_bscore := public._tb_score(v_bhand);
      end if;
    end if;
  end if;

  if v_forced = 'player' then
    v_phand := '[{"rank":"9","suit":"♥","is_red":true,"value":9},{"rank":"K","suit":"♠","is_red":false,"value":0}]'::jsonb;
    v_bhand := '[{"rank":"5","suit":"♦","is_red":true,"value":5},{"rank":"J","suit":"♣","is_red":false,"value":0}]'::jsonb;
  elsif v_forced = 'banker' then
    v_phand := '[{"rank":"4","suit":"♠","is_red":false,"value":4},{"rank":"Q","suit":"♥","is_red":true,"value":0}]'::jsonb;
    v_bhand := '[{"rank":"9","suit":"♦","is_red":true,"value":9},{"rank":"K","suit":"♣","is_red":false,"value":0}]'::jsonb;
  elsif v_forced = 'tie' then
    v_phand := '[{"rank":"8","suit":"♥","is_red":true,"value":8},{"rank":"10","suit":"♠","is_red":false,"value":0}]'::jsonb;
    v_bhand := '[{"rank":"8","suit":"♦","is_red":true,"value":8},{"rank":"J","suit":"♣","is_red":false,"value":0}]'::jsonb;
  elsif v_forced = 'tiger' then
    v_phand := '[{"rank":"5","suit":"♥","is_red":true,"value":5},{"rank":"10","suit":"♠","is_red":false,"value":0}]'::jsonb;
    v_bhand := '[{"rank":"6","suit":"♦","is_red":true,"value":6},{"rank":"Q","suit":"♣","is_red":false,"value":0}]'::jsonb;
  end if;
  v_pscore := public._tb_score(v_phand);
  v_bscore := public._tb_score(v_bhand);

  if v_odds205 then
    if v_pscore = v_bscore or v_forced in ('auto','tie') then
      v_coin := random();
      if v_coin >= 0.5 then
        v_phand := '[{"rank":"9","suit":"♥","is_red":true,"value":9},{"rank":"K","suit":"♠","is_red":false,"value":0}]'::jsonb;
        v_bhand := '[{"rank":"5","suit":"♦","is_red":true,"value":5},{"rank":"J","suit":"♣","is_red":false,"value":0}]'::jsonb;
      else
        v_phand := '[{"rank":"4","suit":"♠","is_red":false,"value":4},{"rank":"Q","suit":"♥","is_red":true,"value":0}]'::jsonb;
        v_bhand := '[{"rank":"9","suit":"♦","is_red":true,"value":9},{"rank":"K","suit":"♣","is_red":false,"value":0}]'::jsonb;
      end if;
    elsif v_pscore = v_bscore then
      v_phand := '[{"rank":"8","suit":"♠","is_red":false,"value":8},{"rank":"K","suit":"♥","is_red":true,"value":0}]'::jsonb;
      v_bhand := '[{"rank":"3","suit":"♦","is_red":true,"value":3},{"rank":"4","suit":"♣","is_red":false,"value":4}]'::jsonb;
    end if;
    v_pscore := public._tb_score(v_phand);
    v_bscore := public._tb_score(v_bhand);
  end if;

  if jsonb_array_length(v_phand) = 2 and (v_phand->0->>'rank') = (v_phand->1->>'rank') then
    v_winners := array_append(v_winners, 'player_pair');
    if v_bet_pp > 0 then
      v_pay := v_bet_pp * 11 + v_bet_pp;
      v_payout := v_payout + v_pay;
      v_summary := array_append(v_summary, 'PLAYER PAIR (11:1): +' || v_pay);
    end if;
  end if;
  if jsonb_array_length(v_bhand) = 2 and (v_bhand->0->>'rank') = (v_bhand->1->>'rank') then
    v_winners := array_append(v_winners, 'banker_pair');
    if v_bet_bp > 0 then
      v_pay := v_bet_bp * 11 + v_bet_bp;
      v_payout := v_payout + v_pay;
      v_summary := array_append(v_summary, 'BANKER PAIR (11:1): +' || v_pay);
    end if;
  end if;

  if v_pscore > v_bscore then
    v_winners := array_append(v_winners, 'player');
    if v_bet_player > 0 then
      v_pay := case when v_odds205 then floor(v_bet_player * 2.1) else v_bet_player * 2 end;
      v_payout := v_payout + v_pay;
      v_summary := array_append(v_summary, 'PLAYER thắng: +' || v_pay);
    end if;
  elsif v_bscore > v_pscore then
    v_winners := array_append(v_winners, 'banker');
    if v_bet_banker > 0 then
      v_pay := case when v_odds205 then floor(v_bet_banker * 2.1) else floor(v_bet_banker * 0.95) + v_bet_banker end;
      v_payout := v_payout + v_pay;
      v_summary := array_append(v_summary, 'BANKER thắng: +' || v_pay);
    end if;
    if v_bscore = 6 then
      v_winners := array_append(v_winners, 'tiger');
      if v_bet_tiger > 0 then
        v_pay := v_bet_tiger * 40 + v_bet_tiger;
        v_payout := v_payout + v_pay;
        v_summary := array_append(v_summary, 'TIGER 6 ĐIỂM (40:1): +' || v_pay);
      end if;
    end if;
  else
    v_winners := array_append(v_winners, 'tie');
    if v_bet_tie > 0 then
      v_pay := v_bet_tie * 8 + v_bet_tie;
      v_payout := v_payout + v_pay;
      v_summary := array_append(v_summary, 'TIE Hòa (8:1): +' || v_pay);
    else
      v_payout := v_payout + v_bet_player + v_bet_banker;
    end if;
  end if;

  if v_payout > 0 then
    perform set_config('app.trusted_balance_rpc', 'on', true);
    update public.users
      set balance = greatest(0, balance + v_payout),
          balance_version = balance_version + 1,
          last_active = now()
      where id = v_user_id
      returning balance, balance_version into v_new_balance, v_new_version;
  else
    select balance, balance_version into v_new_balance, v_new_version
      from public.users where id = v_user_id;
  end if;

  update public.casino_rounds
    set status = 'settled', updated_at = now(),
        round_state = jsonb_build_object('player_hand', v_phand, 'banker_hand', v_bhand, 'payout', v_payout)
    where id = p_round_id;

  return jsonb_build_object(
    'player_hand', v_phand,
    'banker_hand', v_bhand,
    'player_score', v_pscore,
    'banker_score', v_bscore,
    'winning_zones', to_jsonb(v_winners),
    'win_summary', to_jsonb(v_summary),
    'total_payout', v_payout,
    'balance', v_new_balance,
    'balance_version', v_new_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.reveal_xitobala_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_round record;
  v_player_eval jsonb;
  v_dealer_eval jsonb;
  v_pot bigint;
  v_payout bigint := 0;
  v_balance bigint;
  v_version bigint;
  v_player_wins boolean;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;

  select * into v_round from public.casino_rounds
    where id = p_round_id and user_id = v_user_id and game_slug = 'xi-to-ba-la' and status = 'pending'
    for update;
  if not found then
    raise exception 'round not found or already settled';
  end if;

  v_player_eval := public._xito_evaluate(v_round.round_state->'player_hand');
  v_dealer_eval := public._xito_evaluate(v_round.round_state->'dealer_hand');
  v_pot := (v_round.round_state->>'pot')::bigint;
  v_player_wins := (v_player_eval->>'score')::int >= (v_dealer_eval->>'score')::int;

  if v_player_wins then
    v_payout := round(v_pot * (v_player_eval->>'multiplier')::numeric);
    perform set_config('app.trusted_balance_rpc', 'on', true);
    update public.users
      set balance = greatest(0, balance + v_payout), balance_version = balance_version + 1, last_active = now()
      where id = v_user_id
      returning balance, balance_version into v_balance, v_version;
  else
    select balance, balance_version into v_balance, v_version from public.users where id = v_user_id;
  end if;

  update public.casino_rounds
    set status = 'settled', updated_at = now(),
        round_state = round_state || jsonb_build_object('player_eval', v_player_eval, 'dealer_eval', v_dealer_eval, 'payout', v_payout)
    where id = p_round_id;

  return jsonb_build_object(
    'dealer_hand', v_round.round_state->'dealer_hand',
    'player_hand', v_round.round_state->'player_hand',
    'player_eval', v_player_eval,
    'dealer_eval', v_dealer_eval,
    'player_wins', v_player_wins,
    'pot', v_pot,
    'payout', v_payout,
    'balance', v_balance,
    'balance_version', v_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_user_balance_absolute(p_user_id text, p_balance bigint, p_total_deposited bigint)
 RETURNS TABLE(balance bigint, total_deposited bigint, balance_version bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized to set balance directly';
  end if;

  perform set_config('app.trusted_balance_rpc', 'on', true);

  return query
  update public.users
  set
    balance = greatest(0, p_balance),
    total_deposited = greatest(0, p_total_deposited),
    balance_version = public.users.balance_version + 1,
    last_active = now()
  where id = p_user_id
  returning public.users.balance, public.users.total_deposited, public.users.balance_version;
end;
$function$;


CREATE OR REPLACE FUNCTION public.settle_matured_investments()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tx record;
  v_payout bigint;
  v_count integer := 0;
begin
  perform set_config('app.trusted_balance_rpc', 'on', true);

  for v_tx in
    select * from public.transactions
    where payout_status is distinct from 'paid'
      and status is distinct from 'completed_payout'
      and matures_at is not null
      and matures_at <= now()
    for update skip locked
  loop
    v_payout := round(coalesce(nullif(v_tx.total, 0), coalesce(v_tx.amount, 0) + coalesce(v_tx.profit, 0)));
    if v_payout <= 0 then
      continue;
    end if;

    update public.transactions
      set status = 'completed_payout', payout_status = 'paid', interest_status = 'completed'
      where id = v_tx.id;

    insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
    values (
      gen_random_uuid()::text, v_tx.user_id, 'deposit', v_payout, 'approved',
      'Đáo Hạn Dự Án',
      'Đáo hạn dự án "' || coalesce(v_tx.project_title, '') || '" - Hoàn vốn & trả lãi [ref:' || v_tx.id || ']'
    );

    update public.users
      set balance = greatest(0, balance + v_payout),
          balance_version = balance_version + 1,
          last_active = now()
      where id = v_tx.user_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;


CREATE OR REPLACE FUNCTION public.spin_lucky_wheel()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_today date := current_date;
  v_today_deposit bigint;
  v_earned int;
  v_used int;
  v_rand numeric;
  v_prize_label text;
  v_prize_amount bigint;
  v_balance bigint;
  v_version bigint;
  v_tx_id text;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.users where id = v_user_id and is_locked = true) then
    raise exception 'account is locked';
  end if;

  select coalesce(sum(amount), 0) into v_today_deposit
    from public.wallet_transactions
    where user_id = v_user_id and type = 'deposit' and status in ('approved','completed')
      and created_date::date = v_today;

  v_earned := case
    when v_today_deposit >= 150000000 then 3
    when v_today_deposit >= 80000000 then 2
    when v_today_deposit >= 20000000 then 1
    else 0
  end;

  insert into public.lucky_wheel_spins (user_id, spin_date, used_count)
    values (v_user_id, v_today, 0)
    on conflict (user_id, spin_date) do nothing;

  select used_count into v_used from public.lucky_wheel_spins
    where user_id = v_user_id and spin_date = v_today for update;

  if v_used >= v_earned then
    raise exception 'no spins left';
  end if;

  update public.lucky_wheel_spins set used_count = used_count + 1, updated_at = now()
    where user_id = v_user_id and spin_date = v_today;

  v_rand := random() * 100;
  if v_rand <= 30 then v_prize_label := '100K VNĐ'; v_prize_amount := 100000;
  elsif v_rand <= 45 then v_prize_label := '500K VNĐ'; v_prize_amount := 500000;
  elsif v_rand <= 70 then v_prize_label := 'Chúc may'; v_prize_amount := 0;
  elsif v_rand <= 78 then v_prize_label := '1M VNĐ'; v_prize_amount := 1000000;
  elsif v_rand <= 93 then v_prize_label := '50K VNĐ'; v_prize_amount := 50000;
  else v_prize_label := '5M VNĐ'; v_prize_amount := 5000000;
  end if;

  if v_prize_amount > 0 then
    perform set_config('app.trusted_balance_rpc', 'on', true);
    update public.users
      set balance = greatest(0, balance + v_prize_amount), balance_version = balance_version + 1, last_active = now()
      where id = v_user_id
      returning balance, balance_version into v_balance, v_version;

    v_tx_id := 'wtx_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.wallet_transactions (id, user_id, type, amount, status, category, note)
      values (v_tx_id, v_user_id, 'deposit', v_prize_amount, 'approved', 'Thưởng Vòng Quay', 'Trúng thưởng ' || v_prize_label || ' từ Vòng Quay May Mắn');
  else
    select balance, balance_version into v_balance, v_version from public.users where id = v_user_id;
  end if;

  return jsonb_build_object(
    'prize_label', v_prize_label,
    'prize_amount', v_prize_amount,
    'spins_left', greatest(0, v_earned - (v_used + 1)),
    'earned_spins', v_earned,
    'today_deposit', v_today_deposit,
    'balance', v_balance,
    'balance_version', v_version
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.start_xitobala_round(p_bet_amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id text := auth.uid()::text;
  v_player jsonb;
  v_dealer jsonb;
  v_pot bigint;
  v_balance bigint;
  v_round_id uuid;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_bet_amount < 25000 or p_bet_amount > 2000000 or p_bet_amount % 25000 <> 0 then
    raise exception 'invalid bet amount';
  end if;
  if exists (select 1 from public.users where id = v_user_id and is_locked = true) then
    raise exception 'account is locked';
  end if;

  delete from public.casino_rounds where user_id = v_user_id and game_slug = 'xi-to-ba-la' and status = 'pending';

  perform set_config('app.trusted_balance_rpc', 'on', true);
  update public.users
    set balance = balance - p_bet_amount, balance_version = balance_version + 1, last_active = now()
    where id = v_user_id and balance >= p_bet_amount
    returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient balance';
  end if;

  v_player := jsonb_build_array(public._xito_draw_card(), public._xito_draw_card(), public._xito_draw_card());
  v_dealer := jsonb_build_array(public._xito_draw_card(), public._xito_draw_card(), public._xito_draw_card());
  v_pot := p_bet_amount * 4 + 250000;

  insert into public.casino_rounds (user_id, game_slug, status, total_wagered, bets, round_state)
  values (v_user_id, 'xi-to-ba-la', 'pending', p_bet_amount,
          jsonb_build_object('bet_amount', p_bet_amount),
          jsonb_build_object('player_hand', v_player, 'dealer_hand', v_dealer, 'pot', v_pot, 'bet_amount', p_bet_amount))
  returning id into v_round_id;

  return jsonb_build_object(
    'round_id', v_round_id, 'player_hand', v_player, 'pot', v_pot, 'bet_amount', p_bet_amount, 'balance', v_balance
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.withdraw_from_savings_goal(p_goal_id text, p_amount bigint)
 RETURNS savings_goals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_goal public.savings_goals;
  v_uid text := auth.uid()::text;
  v_new_amount bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO v_goal FROM public.savings_goals WHERE id = p_goal_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'goal not found or not owned by caller';
  END IF;
  IF v_goal.current_amount < p_amount THEN
    RAISE EXCEPTION 'amount exceeds goal current_amount';
  END IF;

  v_new_amount := v_goal.current_amount - p_amount;
  UPDATE public.savings_goals
  SET current_amount = v_new_amount,
      status = CASE WHEN v_new_amount >= target_amount AND target_amount > 0 THEN 'completed' ELSE 'active' END,
      completed_at = CASE WHEN v_new_amount < target_amount THEN NULL ELSE v_goal.completed_at END
  WHERE id = p_goal_id
  RETURNING * INTO v_goal;

  PERFORM set_config('app.trusted_balance_rpc', 'on', true);
  UPDATE public.users SET balance = balance + p_amount, balance_version = balance_version + 1 WHERE id = v_uid;

  RETURN v_goal;
END;
$function$;

-- ─── Khoá quyền thực thi cho các hàm nội bộ / chỉ service_role ─────────────
-- (mặc định Postgres cấp EXECUTE cho PUBLIC khi tạo hàm - các hàm dưới đây
-- đã bị REVOKE khỏi PUBLIC/anon/authenticated có chủ đích, chỉ service_role
-- hoặc chủ sở hữu mới gọi được).

REVOKE ALL ON FUNCTION public._baicao_draw_card() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._baicao_draw_card() TO service_role;

REVOKE ALL ON FUNCTION public._xito_draw_card() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._xito_draw_card() TO service_role;

REVOKE ALL ON FUNCTION public._xito_evaluate(hand jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._xito_evaluate(hand jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.check_username_unique() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_unique() TO service_role;

REVOKE ALL ON FUNCTION public.credit_daily_interest_batch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.credit_daily_interest_batch() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_daily_interest_batch() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.protect_privileged_user_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_privileged_user_fields() TO service_role;

REVOKE ALL ON FUNCTION public.settle_matured_investments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_matured_investments() TO service_role;

-- is_admin(): PUBLIC mặc định bị thu hồi, cấp lại tường minh cho 3 role thật
-- (anon/authenticated cần gọi được vì mọi RLS policy khác đều check qua hàm
-- này; service_role cũng cần cho các RPC chạy nền).
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
-- ─── Triggers (bảng public) ─────────────────────────────────────────────────
CREATE TRIGGER threads_set_updated_at BEFORE UPDATE ON public.threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_compute_transaction_interest BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION compute_transaction_interest();
CREATE TRIGGER trg_protect_transaction_financial_fields BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION protect_transaction_financial_fields();
CREATE TRIGGER trg_check_username_unique BEFORE INSERT OR UPDATE OF username ON public.users FOR EACH ROW EXECUTE FUNCTION check_username_unique();
CREATE TRIGGER trg_protect_privileged_user_fields BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION protect_privileged_user_fields();

-- ─── Trigger trên auth.users (Supabase Auth) - tự tạo bản ghi public.users khi đăng ký ───
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casino_secure_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_wheel_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ───────────────────────────────────────────────────────────
CREATE POLICY audit_logs_insert_admin_only ON public.audit_logs FOR INSERT WITH CHECK (is_admin());
CREATE POLICY audit_logs_select_admin_only ON public.audit_logs FOR SELECT USING (is_admin());

CREATE POLICY bank_accounts_all_own_or_admin ON public.bank_accounts FOR ALL USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY casino_rounds_select_own ON public.casino_rounds FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY casino_secure_config_write_admin ON public.casino_secure_config FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY casino_secure_config_select_admin ON public.casino_secure_config FOR SELECT USING (is_admin());

CREATE POLICY investment_projects_write_admin_only ON public.investment_projects FOR INSERT WITH CHECK (is_admin());
CREATE POLICY investment_projects_delete_admin_only ON public.investment_projects FOR DELETE USING (is_admin());
CREATE POLICY investment_projects_update_admin_only ON public.investment_projects FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY investment_projects_select_all ON public.investment_projects FOR SELECT USING (true);

CREATE POLICY lucky_wheel_spins_select_own ON public.lucky_wheel_spins FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY messages_insert_own_or_admin ON public.messages FOR INSERT WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY messages_update_own_or_admin ON public.messages FOR UPDATE USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY messages_select_own_or_admin ON public.messages FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY messen_all_own_or_admin ON public.messen FOR ALL USING ((((auth.uid())::text = created_by_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = created_by_id) OR is_admin()));

CREATE POLICY news_write_admin_only ON public.news FOR INSERT WITH CHECK (is_admin());
CREATE POLICY news_select_all ON public.news FOR SELECT USING (true);
CREATE POLICY news_update_admin_only ON public.news FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY news_delete_admin_only ON public.news FOR DELETE USING (is_admin());

CREATE POLICY notifications_insert_authenticated ON public.notifications FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) OR is_admin()));
CREATE POLICY notifications_select_own_or_admin ON public.notifications FOR SELECT USING ((((auth.uid())::text = user_id) OR (user_id IS NULL) OR is_admin()));
CREATE POLICY notifications_delete_own_or_admin ON public.notifications FOR DELETE USING ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY notifications_update_own_or_admin ON public.notifications FOR UPDATE USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY savings_goals_update_own_or_admin ON public.savings_goals FOR UPDATE USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY savings_goals_delete_own_or_admin ON public.savings_goals FOR DELETE USING ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY savings_goals_select_own_or_admin ON public.savings_goals FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY savings_goals_insert_own ON public.savings_goals FOR INSERT WITH CHECK (((auth.uid())::text = user_id));

CREATE POLICY signatures_all_own_or_admin ON public.signatures FOR ALL USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY "threads insert" ON public.threads FOR INSERT WITH CHECK (true);
CREATE POLICY "threads update" ON public.threads FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM thread_members tm
  WHERE ((tm.thread_id = threads.id) AND (tm.user_id = auth.uid())))));
CREATE POLICY "threads read" ON public.threads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM thread_members tm
  WHERE ((tm.thread_id = threads.id) AND (tm.user_id = auth.uid())))));

CREATE POLICY transactions_delete_admin_only ON public.transactions FOR DELETE USING (is_admin());
CREATE POLICY transactions_update_own_or_admin ON public.transactions FOR UPDATE USING ((((auth.uid())::text = user_id) OR is_admin())) WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY transactions_insert_own_or_admin ON public.transactions FOR INSERT WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY transactions_select_own_or_admin ON public.transactions FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));

CREATE POLICY users_select_own_or_admin ON public.users FOR SELECT USING ((((auth.uid())::text = id) OR is_admin()));
CREATE POLICY users_update_own_or_admin ON public.users FOR UPDATE USING ((((auth.uid())::text = id) OR is_admin())) WITH CHECK ((((auth.uid())::text = id) OR is_admin()));
CREATE POLICY users_insert_own_or_admin ON public.users FOR INSERT WITH CHECK ((((auth.uid())::text = id) OR is_admin()));
CREATE POLICY users_delete_admin_only ON public.users FOR DELETE USING (is_admin());

CREATE POLICY wallet_tx_select_own_or_admin ON public.wallet_transactions FOR SELECT USING ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY wallet_tx_insert_own ON public.wallet_transactions FOR INSERT WITH CHECK ((((auth.uid())::text = user_id) OR is_admin()));
CREATE POLICY wallet_tx_delete_admin_only ON public.wallet_transactions FOR DELETE USING (is_admin());
CREATE POLICY wallet_tx_update_admin_only ON public.wallet_transactions FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
-- ─── Realtime publication ───────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.investment_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.news;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signatures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- ─── Cron job (pg_cron) - tự động đáo hạn dự án đầu tư mỗi 5 phút ──────────
SELECT cron.schedule('settle-matured-investments', '*/5 * * * *', 'select public.settle_matured_investments();');

-- ─── Column comments ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.investment_projects.rate IS '[DEPRECATED - chỉ hiển thị lịch sử] không dùng để tính lãi, xem total_term_interest_rate.';
COMMENT ON COLUMN public.investment_projects.duration IS '[DEPRECATED - chỉ hiển thị lịch sử] không dùng để tính maturity_date, xem term_duration_minutes.';
COMMENT ON COLUMN public.investment_projects.total_term_interest_rate IS 'Lãi suất TOÀN KỲ (%) áp vào vốn gốc, thanh toán 1 lần khi đáo hạn.';
COMMENT ON COLUMN public.investment_projects.term_duration_minutes IS 'Kỳ hạn quy đổi ra phút - nguồn duy nhất để tính maturity_date.';
COMMENT ON COLUMN public.investment_projects.stock_symbol IS 'Mã cổ phiếu (vd VIC, VHM) - chỉ dùng cho category Đầu tư chứng khoán.';
COMMENT ON COLUMN public.investment_projects.daily_change_percent IS 'Biến động giá trong ngày (%) - chỉ dùng cho category Đầu tư chứng khoán.';
COMMENT ON COLUMN public.investment_projects.legal_status IS 'Tình trạng pháp lý (vd "Sổ hồng chính chủ") - chỉ dùng cho category VinHomes.';
COMMENT ON COLUMN public.investment_projects.growth_history IS 'Lịch sử tăng trưởng hiển thị (vd "+18.5% (3 năm qua)") - chỉ dùng cho category VinHomes.';
COMMENT ON COLUMN public.investment_projects.monthly_transactions IS 'Số giao dịch/tháng hiển thị (vd "142 giao dịch/tháng") - chỉ dùng cho category VinHomes.';
COMMENT ON COLUMN public.investment_projects.tag IS 'Nhãn ngắn hiển thị trên thẻ (vd "Biển"/"Đảo"/"Vịnh") - chỉ dùng cho category Đầu tư nghỉ dưỡng.';
COMMENT ON COLUMN public.transactions.matures_at IS 'Thời điểm đáo hạn tuyệt đối = created_date + term_duration_minutes (snapshot lúc tạo).';
COMMENT ON COLUMN public.transactions.interest_status IS 'pending: lãi đã tính trước nhưng chưa trả | completed: đã cộng gốc+lãi vào available_balance.';
COMMENT ON COLUMN public.users.id_card_number IS 'Số CCCD/Hộ chiếu do user tự khai trong hồ sơ cá nhân - hiển thị ẩn (chỉ 4 số cuối) phía user, admin xem được đầy đủ.';
