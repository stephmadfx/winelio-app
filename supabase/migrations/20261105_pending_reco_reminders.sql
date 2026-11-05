-- Relance email "reco sans mouvement" (PENDING depuis plusieurs jours).
-- Migration additive : 2 colonnes nullables, aucune donnée existante modifiée.

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS pending_reminder_sent_at timestamptz;

COMMENT ON COLUMN winelio.recommendations.pending_reminder_sent_at IS
  'Date d''envoi de la relance "reco sans mouvement" (J+3, une seule fois). Distinct de scraped_reminder_sent_at.';

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS reco_reminders_opt_out_at timestamptz;

COMMENT ON COLUMN winelio.profiles.reco_reminders_opt_out_at IS
  'Le pro ne veut plus recevoir les relances "reco sans mouvement" (lien de désinscription du mail).';

-- Planification pg_cron : même mécanique que 20260903_schedule_stripe_commission_reminders.sql
-- (le header Authorization est repris du job process-email-queue, jamais écrit dans le dépôt).
DO $migration$
DECLARE
  email_worker_command text;
  reminder_command text;
  existing_job_id bigint;
BEGIN
  SELECT command INTO email_worker_command
  FROM cron.job
  WHERE jobname = 'process-email-queue' AND active = true
  ORDER BY jobid DESC LIMIT 1;

  IF email_worker_command IS NULL THEN
    RAISE EXCEPTION 'process-email-queue cron job not found';
  END IF;

  reminder_command := replace(
    email_worker_command,
    'https://winelio.app/api/email/process-queue',
    'https://winelio.app/api/recommendations/cron-pending-reminder'
  );

  IF reminder_command = email_worker_command THEN
    RAISE EXCEPTION 'unable to derive pending reminder cron command';
  END IF;

  FOR existing_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'pending-reco-reminders'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  -- Une fois par jour à 08:15 UTC.
  PERFORM cron.schedule('pending-reco-reminders', '15 8 * * *', reminder_command);
END
$migration$;
