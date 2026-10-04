ALTER TABLE winelio.newsletters ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE winelio.newsletter_templates ADD COLUMN IF NOT EXISTS last_test_campaign_id uuid REFERENCES winelio.newsletters(id) ON DELETE SET NULL;
