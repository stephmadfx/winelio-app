-- Table de suivi des sessions de paiement Stripe pour les commissions
CREATE TABLE IF NOT EXISTS winelio.stripe_payment_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount            NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'expired')),
  reminder_sent_at  TIMESTAMPTZ,
  alert_sent_at     TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule session 'pending' par recommandation (idempotence)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_session_pending
  ON winelio.stripe_payment_sessions (recommendation_id)
  WHERE status = 'pending';

-- Index pour le cron (recherche par status + dates)
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_status_dates
  ON winelio.stripe_payment_sessions (status, created_at, reminder_sent_at, alert_sent_at)
  WHERE status = 'pending';

-- RLS : accessible uniquement via service_role (supabaseAdmin)
ALTER TABLE winelio.stripe_payment_sessions ENABLE ROW LEVEL SECURITY;
