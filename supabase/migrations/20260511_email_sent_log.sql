-- Tracking de tous les emails effectivement envoyés (Resend ou SMTP).
-- Sert à enforcer le quota Resend (100/jour, 3000/mois) avec fallback automatique
-- sur le SMTP o2switch dès que la limite est atteinte.

CREATE TABLE IF NOT EXISTS winelio.email_sent_log (
  id          BIGSERIAL PRIMARY KEY,
  provider    TEXT NOT NULL CHECK (provider IN ('resend', 'smtp')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  to_email    TEXT NOT NULL,
  subject     TEXT,
  success     BOOLEAN NOT NULL DEFAULT true,
  error       TEXT,
  provider_id TEXT  -- ID externe (resend email id) pour debug/recherche
);

CREATE INDEX IF NOT EXISTS idx_email_sent_log_sent_at
  ON winelio.email_sent_log (sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_sent_log_provider_date
  ON winelio.email_sent_log (provider, sent_at DESC)
  WHERE success = true;

COMMENT ON TABLE winelio.email_sent_log IS
  'Log de chaque email envoyé. Utilisé pour mesurer la consommation Resend (quota 100/j, 3000/mois) et basculer sur SMTP en fallback.';
