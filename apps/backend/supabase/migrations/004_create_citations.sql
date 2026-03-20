CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT,
  source_type TEXT,
  title TEXT,
  brands_mentioned JSONB DEFAULT '[]'::jsonb,
  content_snippet TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own citations" ON citations
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

CREATE INDEX idx_citations_brand ON citations(brand_id);
CREATE INDEX idx_citations_url ON citations(url);
CREATE INDEX idx_citations_run ON citations(run_id);
