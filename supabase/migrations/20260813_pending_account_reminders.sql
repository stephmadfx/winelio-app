-- Trois relances d'activation, espacées de 48 heures.
-- Une ligne existe uniquement pour les comptes préinscrits par un parrain.
CREATE TABLE IF NOT EXISTS winelio.pending_account_reminders (
  user_id             uuid PRIMARY KEY REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  reminder_count      smallint NOT NULL DEFAULT 0 CHECK (reminder_count BETWEEN 0 AND 3),
  next_reminder_at    timestamptz,
  last_reminder_at    timestamptz,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'cancelled')),
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_account_reminders_due_idx
  ON winelio.pending_account_reminders (next_reminder_at)
  WHERE status = 'pending';

ALTER TABLE winelio.pending_account_reminders ENABLE ROW LEVEL SECURITY;

-- Reprendre aussi les préinscriptions déjà en attente au moment du déploiement.
-- La première relance part au prochain passage du cron si les 48 h sont déjà écoulées.
INSERT INTO winelio.pending_account_reminders (user_id, next_reminder_at)
SELECT p.id, GREATEST(p.created_at + interval '48 hours', now())
FROM winelio.profiles p
WHERE p.onboarding_status = 'pending_confirmation'
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE winelio.pending_account_reminders IS
  'Etat de la séquence de trois relances d activation à J+2, J+4 et J+6.';
