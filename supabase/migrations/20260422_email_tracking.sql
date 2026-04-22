-- Tracking du comportement email sur chaque recommandation.
-- - email_opened_at  : premier chargement du pixel 1x1 par le client email du pro
-- - email_clicked_at : premier clic sur le CTA (via /api/email-track/click)
-- Seule la première interaction est enregistrée (update IS NULL dans les routes).

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS email_opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS email_clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reco_email_opened
  ON winelio.recommendations(email_opened_at) WHERE email_opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_email_clicked
  ON winelio.recommendations(email_clicked_at) WHERE email_clicked_at IS NOT NULL;
