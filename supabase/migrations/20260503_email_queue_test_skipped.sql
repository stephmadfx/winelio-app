-- Permet le statut 'test_skipped' sur winelio.email_queue.
-- Utilisé par /api/email/process-queue pour les destinataires @winelio-e2e.local :
-- l'email est conservé en DB (lisible par Playwright) mais non envoyé via SMTP.

ALTER TABLE winelio.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_status_check;

ALTER TABLE winelio.email_queue
  ADD CONSTRAINT email_queue_status_check
  CHECK (status = ANY (ARRAY['pending', 'sending', 'sent', 'failed', 'test_skipped']));
