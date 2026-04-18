-- AEO Content Moat System
-- Adds: prompts_v2, prompt_variants, competitor_urls, competitor_blueprints,
--       pages, page_versions, publishers, publish_jobs,
--       reinforcement_jobs, reinforcement_accounts, citation_runs
-- Drops: blog_posts (replaced by pages pipeline)

-- ─── Drop legacy blog table ────────────────────────────────────────────────

DROP TABLE IF EXISTS blog_posts CASCADE;

-- ─── prompts_v2 ────────────────────────────────────────────────────────────

CREATE TABLE prompts_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'recommendation'
    CHECK (intent IN ('comparison','best_of','how_to','definition','recommendation')),
  vertical TEXT,
  modifiers TEXT[] NOT NULL DEFAULT '{}',
  expected_entities TEXT[] NOT NULL DEFAULT '{}',
  priority_score NUMERIC NOT NULL DEFAULT 0,
  gap_score NUMERIC NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE prompts_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prompts_v2" ON prompts_v2
  FOR ALL USING (
    EXISTS (SELECT 1 FROM brands b WHERE b.id = prompts_v2.brand_id AND b.user_id = auth.uid())
  );

CREATE INDEX idx_prompts_v2_brand ON prompts_v2(brand_id);
CREATE INDEX idx_prompts_v2_priority ON prompts_v2(brand_id, priority_score DESC);
CREATE INDEX idx_prompts_v2_gap ON prompts_v2(brand_id, gap_score DESC);

-- ─── prompt_variants ───────────────────────────────────────────────────────

CREATE TABLE prompt_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts_v2(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE prompt_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prompt_variants" ON prompt_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM prompts_v2 p
      JOIN brands b ON b.id = p.brand_id
      WHERE p.id = prompt_variants.prompt_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_prompt_variants_prompt ON prompt_variants(prompt_id);

-- ─── competitor_urls ───────────────────────────────────────────────────────

CREATE TABLE competitor_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts_v2(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  rank INT NOT NULL DEFAULT 0,
  domain_authority NUMERIC,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, url)
);

ALTER TABLE competitor_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own competitor_urls" ON competitor_urls
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM prompts_v2 p
      JOIN brands b ON b.id = p.brand_id
      WHERE p.id = competitor_urls.prompt_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_competitor_urls_prompt ON competitor_urls(prompt_id);

-- ─── competitor_blueprints ─────────────────────────────────────────────────

CREATE TABLE competitor_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_url_id UUID NOT NULL REFERENCES competitor_urls(id) ON DELETE CASCADE,
  schema JSONB NOT NULL DEFAULT '{}',
  why_winning_signals TEXT[] NOT NULL DEFAULT '{}',
  raw_markdown TEXT,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE competitor_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own competitor_blueprints" ON competitor_blueprints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM competitor_urls cu
      JOIN prompts_v2 p ON p.id = cu.prompt_id
      JOIN brands b ON b.id = p.brand_id
      WHERE cu.id = competitor_blueprints.competitor_url_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_competitor_blueprints_url ON competitor_blueprints(competitor_url_id);

-- ─── pages ─────────────────────────────────────────────────────────────────

CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES prompts_v2(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  tldr TEXT NOT NULL DEFAULT '',
  cps NUMERIC,
  cps_breakdown JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','winning','stale','failing','archived')),
  published_url TEXT,
  published_at TIMESTAMPTZ,
  last_citation_check_at TIMESTAMPTZ,
  citation_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pages" ON pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM brands b WHERE b.id = pages.brand_id AND b.user_id = auth.uid())
  );

CREATE INDEX idx_pages_brand ON pages(brand_id);
CREATE INDEX idx_pages_status ON pages(status);
CREATE INDEX idx_pages_brand_status ON pages(brand_id, status);
CREATE INDEX idx_pages_created ON pages(created_at DESC);
CREATE INDEX idx_pages_prompt ON pages(prompt_id);

-- ─── page_versions ─────────────────────────────────────────────────────────

CREATE TABLE page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  cps NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE page_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own page_versions" ON page_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pages pg
      JOIN brands b ON b.id = pg.brand_id
      WHERE pg.id = page_versions.page_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_page_versions_page ON page_versions(page_id);
CREATE INDEX idx_page_versions_created ON page_versions(created_at DESC);

-- ─── publishers ────────────────────────────────────────────────────────────

CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('wordpress','shopify','webflow')),
  credentials_encrypted JSONB NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{"posts_per_day":2,"min_interval_hours":6,"auto_publish":false}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  posts_today INT NOT NULL DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own publishers" ON publishers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM brands b WHERE b.id = publishers.brand_id AND b.user_id = auth.uid())
  );

CREATE INDEX idx_publishers_brand ON publishers(brand_id);

-- ─── publish_jobs ──────────────────────────────────────────────────────────

CREATE TABLE publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','publishing','published','failed')),
  platform_post_id TEXT,
  platform_url TEXT,
  error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own publish_jobs" ON publish_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pages pg
      JOIN brands b ON b.id = pg.brand_id
      WHERE pg.id = publish_jobs.page_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_publish_jobs_page ON publish_jobs(page_id);
CREATE INDEX idx_publish_jobs_publisher ON publish_jobs(publisher_id);
CREATE INDEX idx_publish_jobs_status ON publish_jobs(status);

-- ─── reinforcement_jobs ────────────────────────────────────────────────────

CREATE TABLE reinforcement_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('reddit','medium','quora')),
  target_phrase TEXT NOT NULL,
  variant_used TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','posted','failed','manual','skipped')),
  external_url TEXT,
  reddit_post_id UUID REFERENCES reddit_posts(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reinforcement_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reinforcement_jobs" ON reinforcement_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pages pg
      JOIN brands b ON b.id = pg.brand_id
      WHERE pg.id = reinforcement_jobs.page_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_reinforcement_jobs_page ON reinforcement_jobs(page_id);
CREATE INDEX idx_reinforcement_jobs_status ON reinforcement_jobs(status);
CREATE INDEX idx_reinforcement_jobs_channel ON reinforcement_jobs(channel);

-- ─── reinforcement_accounts ────────────────────────────────────────────────

CREATE TABLE reinforcement_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('reddit','medium','quora')),
  handle TEXT NOT NULL,
  credentials_encrypted JSONB NOT NULL DEFAULT '{}',
  karma_score INT NOT NULL DEFAULT 0,
  account_age_days INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, channel, handle)
);

ALTER TABLE reinforcement_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reinforcement_accounts" ON reinforcement_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM brands b WHERE b.id = reinforcement_accounts.brand_id AND b.user_id = auth.uid())
  );

CREATE INDEX idx_reinforcement_accounts_brand ON reinforcement_accounts(brand_id);
CREATE INDEX idx_reinforcement_accounts_channel ON reinforcement_accounts(brand_id, channel);

-- ─── citation_runs ─────────────────────────────────────────────────────────
-- Page-level citation tracking (separate from ai_responses which is prompt-level)

CREATE TABLE citation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES prompts_v2(id) ON DELETE SET NULL,
  engine TEXT NOT NULL DEFAULT 'chatgpt',
  response_text TEXT,
  brand_cited BOOLEAN NOT NULL DEFAULT false,
  brand_position INT,
  attributed_to_content BOOLEAN NOT NULL DEFAULT false,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE citation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own citation_runs" ON citation_runs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pages pg
      JOIN brands b ON b.id = pg.brand_id
      WHERE pg.id = citation_runs.page_id AND b.user_id = auth.uid()
    )
  );

CREATE INDEX idx_citation_runs_page ON citation_runs(page_id);
CREATE INDEX idx_citation_runs_ran_at ON citation_runs(page_id, ran_at DESC);
