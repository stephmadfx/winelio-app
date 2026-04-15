CREATE TABLE IF NOT EXISTS winelio.recommendation_annotations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id      UUID NOT NULL
    REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  recommendation_step_id UUID
    REFERENCES winelio.recommendation_steps(id) ON DELETE CASCADE,
  author_id              UUID NOT NULL
    REFERENCES winelio.profiles(id),
  content                TEXT NOT NULL
    CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reco_annotations_reco_id
  ON winelio.recommendation_annotations(recommendation_id, created_at);

ALTER TABLE winelio.recommendation_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_reco_annotations"
  ON winelio.recommendation_annotations FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  );
