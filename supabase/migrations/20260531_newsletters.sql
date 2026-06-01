CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS winelio.newsletters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL CHECK (char_length(trim(subject)) > 0),
  content text NOT NULL DEFAULT '',
  html_content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  recipient_filters jsonb NOT NULL DEFAULT '{"audience":"all","onlyActive":true}'::jsonb,
  selected_recipient_ids uuid[] NOT NULL DEFAULT '{}',
  excluded_recipient_ids uuid[] NOT NULL DEFAULT '{}',
  manual_emails text[] NOT NULL DEFAULT '{}',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.newsletter_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id uuid NOT NULL REFERENCES winelio.newsletters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  email text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('profile', 'professional', 'manual')),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.newsletter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id uuid NOT NULL REFERENCES winelio.newsletters(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES winelio.newsletter_recipients(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('sent', 'opened', 'clicked', 'failed', 'unsubscribed')),
  url text,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.newsletter_settings (
  id text PRIMARY KEY DEFAULT 'newsletter-settings',
  emails_per_minute integer NOT NULL DEFAULT 25 CHECK (emails_per_minute BETWEEN 1 AND 1000),
  delay_between_emails_ms integer NOT NULL DEFAULT 2400 CHECK (delay_between_emails_ms BETWEEN 0 AND 60000),
  preset text NOT NULL DEFAULT 'o2switch' CHECK (preset IN ('o2switch', 'custom')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 'newsletter-settings')
);

INSERT INTO winelio.newsletter_settings (id)
VALUES ('newsletter-settings')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS newsletters_status_created_idx
  ON winelio.newsletters (status, created_at DESC);
CREATE INDEX IF NOT EXISTS newsletter_recipients_newsletter_idx
  ON winelio.newsletter_recipients (newsletter_id);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_recipients_newsletter_email_idx
  ON winelio.newsletter_recipients (newsletter_id, lower(email));
CREATE INDEX IF NOT EXISTS newsletter_recipients_token_idx
  ON winelio.newsletter_recipients (unsubscribe_token);
CREATE INDEX IF NOT EXISTS newsletter_events_newsletter_type_idx
  ON winelio.newsletter_events (newsletter_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION winelio.newsletter_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletters_updated_at ON winelio.newsletters;
CREATE TRIGGER newsletters_updated_at
  BEFORE UPDATE ON winelio.newsletters
  FOR EACH ROW EXECUTE FUNCTION winelio.newsletter_set_updated_at();

DROP TRIGGER IF EXISTS newsletter_settings_updated_at ON winelio.newsletter_settings;
CREATE TRIGGER newsletter_settings_updated_at
  BEFORE UPDATE ON winelio.newsletter_settings
  FOR EACH ROW EXECUTE FUNCTION winelio.newsletter_set_updated_at();

ALTER TABLE winelio.newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.newsletter_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.newsletter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.newsletter_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage newsletters" ON winelio.newsletters;
CREATE POLICY "Super admins manage newsletters"
  ON winelio.newsletters
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

DROP POLICY IF EXISTS "Super admins manage newsletter recipients" ON winelio.newsletter_recipients;
CREATE POLICY "Super admins manage newsletter recipients"
  ON winelio.newsletter_recipients
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

DROP POLICY IF EXISTS "Super admins manage newsletter events" ON winelio.newsletter_events;
CREATE POLICY "Super admins manage newsletter events"
  ON winelio.newsletter_events
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

DROP POLICY IF EXISTS "Super admins manage newsletter settings" ON winelio.newsletter_settings;
CREATE POLICY "Super admins manage newsletter settings"
  ON winelio.newsletter_settings
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

GRANT USAGE ON SCHEMA winelio TO authenticated;
REVOKE ALL ON winelio.newsletters FROM anon, authenticated;
REVOKE ALL ON winelio.newsletter_recipients FROM anon, authenticated;
REVOKE ALL ON winelio.newsletter_events FROM anon, authenticated;
REVOKE ALL ON winelio.newsletter_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON winelio.newsletters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON winelio.newsletter_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON winelio.newsletter_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON winelio.newsletter_settings TO authenticated;
