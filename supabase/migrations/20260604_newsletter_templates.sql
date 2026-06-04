CREATE TABLE IF NOT EXISTS winelio.newsletter_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  subject       text        NOT NULL DEFAULT '',
  preheader     text        NOT NULL DEFAULT '',
  mjml_content  text        NOT NULL DEFAULT '',
  html_content  text        NOT NULL DEFAULT '',
  project_data  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status        text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'ready', 'archived')),
  test_sent_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_templates_user_idx
  ON winelio.newsletter_templates (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION winelio.update_newsletter_templates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_templates_updated_at ON winelio.newsletter_templates;
CREATE TRIGGER newsletter_templates_updated_at
BEFORE UPDATE ON winelio.newsletter_templates
FOR EACH ROW EXECUTE FUNCTION winelio.update_newsletter_templates_updated_at();

ALTER TABLE winelio.newsletter_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_templates_owner_select" ON winelio.newsletter_templates;
CREATE POLICY "newsletter_templates_owner_select"
  ON winelio.newsletter_templates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "newsletter_templates_owner_insert" ON winelio.newsletter_templates;
CREATE POLICY "newsletter_templates_owner_insert"
  ON winelio.newsletter_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "newsletter_templates_owner_update" ON winelio.newsletter_templates;
CREATE POLICY "newsletter_templates_owner_update"
  ON winelio.newsletter_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "newsletter_templates_owner_delete" ON winelio.newsletter_templates;
CREATE POLICY "newsletter_templates_owner_delete"
  ON winelio.newsletter_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
