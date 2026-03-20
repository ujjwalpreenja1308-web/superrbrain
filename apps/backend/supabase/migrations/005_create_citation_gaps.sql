CREATE TABLE citation_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT,
  prompt_id UUID REFERENCES prompts(id),
  engine TEXT,
  opportunity_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE citation_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gaps" ON citation_gaps
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

CREATE INDEX idx_gaps_brand ON citation_gaps(brand_id);
CREATE INDEX idx_gaps_score ON citation_gaps(opportunity_score DESC);
CREATE INDEX idx_gaps_run ON citation_gaps(run_id);
