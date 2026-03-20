CREATE TABLE ai_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  brand_mentioned BOOLEAN DEFAULT false,
  brand_position INTEGER,
  competitor_mentions JSONB DEFAULT '[]'::jsonb,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own responses" ON ai_responses
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

CREATE INDEX idx_ai_responses_brand ON ai_responses(brand_id);
CREATE INDEX idx_ai_responses_run ON ai_responses(run_id);
