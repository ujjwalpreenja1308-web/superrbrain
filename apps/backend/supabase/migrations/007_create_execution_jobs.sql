CREATE TABLE execution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  citation_gap_id UUID NOT NULL REFERENCES citation_gaps(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  platform_type TEXT NOT NULL DEFAULT 'reddit',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE execution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own execution jobs" ON execution_jobs
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

CREATE INDEX idx_execution_jobs_brand ON execution_jobs(brand_id);
CREATE INDEX idx_execution_jobs_gap ON execution_jobs(citation_gap_id);
CREATE INDEX idx_execution_jobs_status ON execution_jobs(status);
