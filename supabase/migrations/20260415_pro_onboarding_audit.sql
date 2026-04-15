-- supabase/migrations/20260415_pro_onboarding_audit.sql

CREATE TABLE IF NOT EXISTS winelio.pro_onboarding_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES winelio.profiles(id),
  event_type       text NOT NULL CHECK (event_type IN (
                     'cgu_accepted',
                     'engagement_accepted',
                     'siret_provided',
                     'category_set',
                     'pro_activated',
                     'signature_completed'
                   )),
  ip_address       text,
  user_agent       text,
  document_id      uuid REFERENCES winelio.legal_documents(id),
  document_version text,
  document_hash    text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_onboarding_events_user_id
  ON winelio.pro_onboarding_events(user_id, created_at DESC);

ALTER TABLE winelio.pro_onboarding_events ENABLE ROW LEVEL SECURITY;

-- Lecture : super_admin uniquement
CREATE POLICY "super_admin_read_onboarding_events"
  ON winelio.pro_onboarding_events FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

-- Écriture : service role uniquement (server actions via supabaseAdmin)
-- Pas de policy INSERT/UPDATE/DELETE pour les rôles non-service
