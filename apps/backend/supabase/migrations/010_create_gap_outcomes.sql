CREATE TABLE gap_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citation_gap_id UUID NOT NULL REFERENCES citation_gaps(id) ON DELETE CASCADE,
  content_id UUID REFERENCES generated_content(id),
  gap_status_before TEXT NOT NULL,
  gap_status_after TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gap_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gap outcomes" ON gap_outcomes
  FOR SELECT USING (
    citation_gap_id IN (
      SELECT id FROM citation_gaps
      WHERE brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
    )
  );

CREATE INDEX idx_gap_outcomes_gap ON gap_outcomes(citation_gap_id);
CREATE INDEX idx_gap_outcomes_detected ON gap_outcomes(detected_at DESC);
