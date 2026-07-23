-- Les comptes préinscrits par un parrain sont visibles dans le réseau avant
-- que le filleul confirme son adresse e-mail et choisisse son mot de passe.
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE winelio.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_status_check;

ALTER TABLE winelio.profiles
  ADD CONSTRAINT profiles_onboarding_status_check
  CHECK (onboarding_status IN ('pending_confirmation', 'active'));

CREATE INDEX IF NOT EXISTS profiles_pending_sponsor_idx
  ON winelio.profiles (sponsor_id, onboarding_status);
