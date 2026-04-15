-- supabase/migrations/20260415_email_queue.sql

CREATE TABLE IF NOT EXISTS winelio.email_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email     text        NOT NULL,
  to_name      text,
  subject      text        NOT NULL,
  html         text        NOT NULL,
  text_body    text,
  from_email   text        NOT NULL DEFAULT 'support@winelio.app',
  from_name    text        NOT NULL DEFAULT 'Winelio',
  reply_to     text,
  priority     int         NOT NULL DEFAULT 5,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','sending','sent','failed')),
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 3,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_queue_process_idx
  ON winelio.email_queue (priority ASC, scheduled_at ASC)
  WHERE status = 'pending';

ALTER TABLE winelio.email_queue ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
