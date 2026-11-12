-- ============================================================================
-- Migration : Notifications Push (iPhone APNs, Android FCM, Web Push VAPID)
--             & Préférences de notifications (100 % activées par défaut)
-- Date      : 2026-11-12
-- ============================================================================

BEGIN;

-- 1. Préférences de notifications (tout activé par défaut pour chaque membre)
ALTER TABLE winelio.messaging_preferences
  ADD COLUMN IF NOT EXISTS notify_official_announcements BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_community_messages     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_message_replies        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_referral           BOOLEAN NOT NULL DEFAULT true;

-- Backfill : s'assurer que tous les profils existants disposent de leurs préférences à true
INSERT INTO winelio.messaging_preferences (user_id)
SELECT p.id
FROM winelio.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- Trigger d'initialisation automatique à l'arrivée d'un nouveau membre (tout activé par défaut)
CREATE OR REPLACE FUNCTION winelio.init_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
BEGIN
  INSERT INTO winelio.messaging_preferences (
    user_id,
    in_app_badges,
    email_major_announcements,
    notify_official_announcements,
    notify_community_messages,
    notify_message_replies,
    notify_new_referral
  )
  VALUES (NEW.id, true, true, true, true, true, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_default_notification_preferences ON winelio.profiles;
CREATE TRIGGER trg_init_default_notification_preferences
  AFTER INSERT ON winelio.profiles
  FOR EACH ROW
  EXECUTE FUNCTION winelio.init_default_notification_preferences();

-- 2. Table winelio.devices : unicité du token par appareil physique + index actif
ALTER TABLE winelio.devices
  ADD COLUMN IF NOT EXISTS device_label TEXT,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE winelio.devices
  DROP CONSTRAINT IF EXISTS devices_platform_check;

ALTER TABLE winelio.devices
  ADD CONSTRAINT devices_platform_check
  CHECK (platform IN ('ios', 'android', 'web'));

CREATE UNIQUE INDEX IF NOT EXISTS devices_token_unique_idx
  ON winelio.devices (token);

CREATE INDEX IF NOT EXISTS devices_user_active_idx
  ON winelio.devices (user_id)
  WHERE is_active = true;

-- 3. Clés VAPID Web Push auto-générées (accès strictement réservé à service_role)
CREATE TABLE IF NOT EXISTS winelio.push_vapid_keys (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key      TEXT NOT NULL,
  private_key_pem TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE winelio.push_vapid_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.push_vapid_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON winelio.push_vapid_keys TO service_role;

-- 4. Journal de déduplication Push (évite tout doublon sur l'arrivée d'un filleul)
CREATE TABLE IF NOT EXISTS winelio.push_notification_log (
  dedupe_key TEXT PRIMARY KEY,
  user_id    UUID REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE winelio.push_notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON winelio.push_notification_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON winelio.push_notification_log TO service_role;

COMMIT;
