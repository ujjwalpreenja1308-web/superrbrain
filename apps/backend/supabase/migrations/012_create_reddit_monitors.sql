CREATE TABLE reddit_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  subreddits TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  automode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reddit_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES reddit_monitors(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL,
  post_title TEXT NOT NULL,
  post_body TEXT,
  subreddit TEXT NOT NULL,
  matched_keyword TEXT NOT NULL,
  author TEXT,
  upvotes INTEGER,
  comment_count INTEGER,
  posted_at TIMESTAMPTZ,
  ai_reply TEXT,
  reply_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | posted | rejected
  posted_url TEXT,
  posted_at_reddit TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(monitor_id, post_id)
);

ALTER TABLE reddit_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE reddit_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own monitors" ON reddit_monitors
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view own reddit posts" ON reddit_posts
  FOR ALL USING (
    monitor_id IN (SELECT id FROM reddit_monitors WHERE user_id = auth.uid())
  );

CREATE INDEX idx_reddit_monitors_brand ON reddit_monitors(brand_id);
CREATE INDEX idx_reddit_monitors_user ON reddit_monitors(user_id);
CREATE INDEX idx_reddit_posts_monitor ON reddit_posts(monitor_id);
CREATE INDEX idx_reddit_posts_brand ON reddit_posts(brand_id);
CREATE INDEX idx_reddit_posts_status ON reddit_posts(reply_status);
CREATE INDEX idx_reddit_posts_created ON reddit_posts(created_at DESC);
