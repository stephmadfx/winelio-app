-- Ajoute une cle metier optionnelle pour rendre les notifications idempotentes.

ALTER TABLE winelio.email_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS email_queue_dedupe_key_idx
  ON winelio.email_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
