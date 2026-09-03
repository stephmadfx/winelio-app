-- Raccorde les relances Stripe au pg_cron deja utilise pour la file d'emails.
-- Le header Authorization est repris du job existant afin de ne jamais
-- enregistrer CRON_SECRET dans le depot ou dans l'historique de migration.

DO $migration$
DECLARE
  email_worker_command text;
  stripe_worker_command text;
  existing_job_id bigint;
BEGIN
  SELECT command
  INTO email_worker_command
  FROM cron.job
  WHERE jobname = 'process-email-queue'
    AND active = true
  ORDER BY jobid DESC
  LIMIT 1;

  IF email_worker_command IS NULL THEN
    RAISE EXCEPTION 'process-email-queue cron job not found';
  END IF;

  stripe_worker_command := replace(
    email_worker_command,
    'https://winelio.app/api/email/process-queue',
    'https://winelio.app/api/stripe/cron-reminders'
  );

  IF stripe_worker_command = email_worker_command THEN
    RAISE EXCEPTION 'unable to derive stripe reminder cron command';
  END IF;

  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'stripe-commission-reminders'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'stripe-commission-reminders',
    '5 * * * *',
    stripe_worker_command
  );
END
$migration$;
