CREATE TABLE IF NOT EXISTS winelio.newsletter_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'unsubscribed',
  source_recipient_id uuid REFERENCES winelio.newsletter_recipients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE winelio.newsletter_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.newsletter_suppressions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON winelio.newsletter_suppressions TO authenticated;

DROP POLICY IF EXISTS "Super admins manage newsletter suppressions" ON winelio.newsletter_suppressions;
CREATE POLICY "Super admins manage newsletter suppressions"
  ON winelio.newsletter_suppressions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

ALTER TABLE winelio.newsletter_templates
  ADD COLUMN IF NOT EXISTS last_campaign_id uuid REFERENCES winelio.newsletters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_campaign_fingerprint text;

CREATE INDEX IF NOT EXISTS newsletter_suppressions_email_idx
  ON winelio.newsletter_suppressions (lower(email));

INSERT INTO winelio.newsletter_suppressions (email, source_recipient_id)
SELECT DISTINCT ON (lower(email)) lower(email), id
FROM winelio.newsletter_recipients
WHERE unsubscribed_at IS NOT NULL
ORDER BY lower(email), unsubscribed_at DESC
ON CONFLICT (email) DO NOTHING;
