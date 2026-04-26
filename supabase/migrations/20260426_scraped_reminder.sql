ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS scraped_reminder_sent_at timestamptz;

COMMENT ON COLUMN winelio.recommendations.scraped_reminder_sent_at IS
  'Date d''envoi de la relance email pour les pros scrappés qui n''ont pas ouvert le premier email (12h après création)';
