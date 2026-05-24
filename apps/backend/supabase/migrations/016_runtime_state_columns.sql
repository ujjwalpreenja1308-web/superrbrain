-- Columns used by staged prompt changes, staged Reddit monitor changes,
-- and billing code paths. Kept idempotent because some production
-- environments may have been patched manually.

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'active',
  trial_expires_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  plan_activated_at TIMESTAMPTZ,
  dodo_customer_id TEXT,
  dodo_subscription_id TEXT,
  plan_override TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_override TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS pending_prompts JSONB,
  ADD COLUMN IF NOT EXISTS pending_prompts_effective_at TIMESTAMPTZ;

ALTER TABLE reddit_monitors
  ADD COLUMN IF NOT EXISTS pending_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS pending_subreddits TEXT[],
  ADD COLUMN IF NOT EXISTS pending_effective_at TIMESTAMPTZ;
