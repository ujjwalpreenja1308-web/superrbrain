-- Tracks user's connected Reddit account via Composio
CREATE TABLE reddit_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  composio_entity_id TEXT NOT NULL,        -- Composio entity ID (= our user_id stringified)
  reddit_username TEXT,                    -- populated after connection
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ
);

ALTER TABLE reddit_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own connection" ON reddit_connections
  FOR ALL USING (user_id = auth.uid());

-- Add scheduling + guardrail columns to reddit_posts
ALTER TABLE reddit_posts
  ADD COLUMN scheduled_for TIMESTAMPTZ,           -- when automode should fire the post
  ADD COLUMN reply_type TEXT NOT NULL DEFAULT 'brand_mention', -- 'brand_mention' | 'helpful' | 'question'
  ADD COLUMN guardrail_skip_reason TEXT;          -- why automode skipped posting this one

CREATE INDEX idx_reddit_posts_scheduled ON reddit_posts(scheduled_for)
  WHERE reply_status = 'approved' AND scheduled_for IS NOT NULL;
