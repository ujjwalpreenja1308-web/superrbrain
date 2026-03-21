CREATE TABLE platform_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  platform_type TEXT NOT NULL,
  subreddit TEXT,
  format_rules JSONB NOT NULL DEFAULT '{}',
  tone_parameters JSONB NOT NULL DEFAULT '{}',
  content_patterns JSONB NOT NULL DEFAULT '{}',
  sample_comments JSONB NOT NULL DEFAULT '[]',
  last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_platform_profiles_domain_subreddit ON platform_profiles(domain, COALESCE(subreddit, ''));
CREATE INDEX idx_platform_profiles_domain ON platform_profiles(domain);
