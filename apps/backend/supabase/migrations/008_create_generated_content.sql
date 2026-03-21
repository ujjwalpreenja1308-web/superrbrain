CREATE TABLE generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_job_id UUID NOT NULL REFERENCES execution_jobs(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'reddit_comment',
  content_body TEXT NOT NULL,
  angle_used TEXT,
  strategy_reasoning TEXT,
  platform_profile_id UUID REFERENCES platform_profiles(id),
  generation_attempt INTEGER NOT NULL DEFAULT 1,
  quality_scores JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  deployed_at TIMESTAMPTZ,
  deployed_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generated content" ON generated_content
  FOR SELECT USING (
    execution_job_id IN (
      SELECT id FROM execution_jobs
      WHERE brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    )
  );

CREATE INDEX idx_generated_content_job ON generated_content(execution_job_id);
CREATE INDEX idx_generated_content_status ON generated_content(status);
