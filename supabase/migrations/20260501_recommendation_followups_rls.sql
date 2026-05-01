ALTER TABLE winelio.recommendation_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pro sees own followups"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winelio.recommendations r
      WHERE r.id = recommendation_followups.recommendation_id
        AND r.professional_id = auth.uid()
    )
  );

CREATE POLICY "Referrer sees own followups (read-only)"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winelio.recommendations r
      WHERE r.id = recommendation_followups.recommendation_id
        AND r.referrer_id = auth.uid()
    )
  );

CREATE POLICY "Super admin sees all followups"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin'
  );
