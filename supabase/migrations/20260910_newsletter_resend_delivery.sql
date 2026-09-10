ALTER TABLE winelio.newsletter_recipients
  ADD COLUMN IF NOT EXISTS delivery_provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE INDEX IF NOT EXISTS newsletter_recipients_provider_message_idx
  ON winelio.newsletter_recipients (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
