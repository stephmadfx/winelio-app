-- Migration 20261112b : Mode espace national seul + message d'accueil automatique des nouveaux membres confirmés

BEGIN;

-- 1. Colonnes dédiées aux messages d'accueil automatiques dans winelio.messaging_messages
ALTER TABLE winelio.messaging_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'post'
    CHECK (message_type IN ('post', 'welcome')),
  ADD COLUMN IF NOT EXISTS welcome_member_id uuid UNIQUE
    REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS welcome_sponsor_id uuid
    REFERENCES winelio.profiles(id) ON DELETE SET NULL;

ALTER TABLE winelio.messaging_messages
  DROP CONSTRAINT IF EXISTS messaging_messages_author_badge_check;

ALTER TABLE winelio.messaging_messages
  ADD CONSTRAINT messaging_messages_author_badge_check
  CHECK (author_badge IN ('admin', 'founder', 'leader', 'pro', 'member', 'welcome'));

CREATE INDEX IF NOT EXISTS messaging_messages_type_idx
  ON winelio.messaging_messages(channel_id, message_type, created_at DESC)
  WHERE parent_message_id IS NULL;

-- 2. Publication idempotente d'un message d'accueil dans « Annonces Winelio »
CREATE OR REPLACE FUNCTION winelio.publish_member_welcome_post(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_announcements_id uuid;
  v_member record;
  v_sponsor_name text;
  v_show_sponsor boolean := false;
  v_member_name text;
  v_content text;
  v_inserted_id uuid;
BEGIN
  IF p_user_id IS NULL OR NOT winelio.is_eligible_messaging_member(p_user_id) THEN
    RETURN;
  END IF;

  -- Vérifier que le compte est réellement confirmé, actif, onboardé, avec prénom et consentement share_activity
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.sponsor_id,
    coalesce(fp.share_activity, true) AS member_share_activity
  INTO v_member
  FROM winelio.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN winelio.feed_preferences fp ON fp.user_id = p.id
  WHERE p.id = p_user_id
    AND p.is_active IS TRUE
    AND p.is_demo IS NOT TRUE
    AND p.onboarding_status = 'active'
    AND nullif(btrim(p.first_name), '') IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL;

  IF NOT FOUND OR v_member.member_share_activity IS NOT TRUE THEN
    RETURN;
  END IF;

  -- S'assurer que le canal national existe
  INSERT INTO winelio.messaging_channels (kind, slug, name, description, allow_member_photos)
  VALUES (
    'announcements',
    'national-announcements',
    'Annonces Winelio',
    'Actualités officielles, formations, nouveautés et réussites du réseau Winelio.',
    false
  )
  ON CONFLICT (slug) DO UPDATE
    SET updated_at = winelio.messaging_channels.updated_at
  RETURNING id INTO v_announcements_id;

  v_member_name := winelio.messaging_display_name(v_member.first_name, v_member.last_name);

  -- Résoudre le parrain si éligible et s'il partage son activité réseau
  IF v_member.sponsor_id IS NOT NULL AND winelio.is_eligible_messaging_member(v_member.sponsor_id) THEN
    SELECT
      winelio.messaging_display_name(sp.first_name, sp.last_name),
      coalesce(sfp.share_activity, true)
    INTO v_sponsor_name, v_show_sponsor
    FROM winelio.profiles sp
    LEFT JOIN winelio.feed_preferences sfp ON sfp.user_id = sp.id
    WHERE sp.id = v_member.sponsor_id;
  END IF;

  IF v_show_sponsor AND v_sponsor_name IS NOT NULL THEN
    v_content := '👋 Bienvenue à ' || v_member_name ||
      ' qui rejoint la communauté Winelio aux côtés de son parrain ' || v_sponsor_name ||
      ' ! Souhaitez-lui la bienvenue 👏';
  ELSE
    v_content := '👋 Bienvenue à ' || v_member_name ||
      ' qui rejoint la communauté Winelio ! Souhaitez-lui la bienvenue 👏';
  END IF;

  -- Insertion idempotente (1 seul message d'accueil maximum par membre grâce à UNIQUE(welcome_member_id))
  -- Ne modifie PAS messaging_channels.last_message_at afin de réserver la pastille non-lue aux annonces officielles.
  INSERT INTO winelio.messaging_messages (
    channel_id,
    author_id,
    author_badge,
    message_type,
    welcome_member_id,
    welcome_sponsor_id,
    title,
    content,
    comments_enabled
  )
  VALUES (
    v_announcements_id,
    NULL,
    'welcome',
    'welcome',
    v_member.id,
    CASE WHEN v_show_sponsor THEN v_member.sponsor_id ELSE NULL END,
    NULL,
    v_content,
    true
  )
  ON CONFLICT (welcome_member_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    PERFORM winelio.broadcast_messaging_event(
      v_announcements_id,
      'messaging_update',
      jsonb_build_object('action', 'welcome_created', 'messageId', v_inserted_id)
    );
  END IF;
END;
$$;

-- 3. Trigger sur winelio.profiles : uniquement lors du passage initial à un profil actif complet (pas rétroactif)
CREATE OR REPLACE FUNCTION winelio.trg_profiles_welcome_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.onboarding_status = 'active' AND nullif(btrim(OLD.first_name), '') IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.onboarding_status = 'active' AND nullif(btrim(NEW.first_name), '') IS NOT NULL THEN
    PERFORM winelio.publish_member_welcome_post(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_winelio_profiles_welcome_post ON winelio.profiles;
CREATE TRIGGER trg_winelio_profiles_welcome_post
  AFTER INSERT OR UPDATE ON winelio.profiles
  FOR EACH ROW
  EXECUTE FUNCTION winelio.trg_profiles_welcome_post();

-- 4. Trigger sur auth.users : si l'email est confirmé après que le profil soit déjà complété
CREATE OR REPLACE FUNCTION winelio.trg_auth_users_welcome_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM winelio.publish_member_welcome_post(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_winelio_auth_welcome_post ON auth.users;
CREATE TRIGGER trg_winelio_auth_welcome_post
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION winelio.trg_auth_users_welcome_post();

-- 5. Respect dynamique du retrait de consentement share_activity dans winelio.feed_preferences
CREATE OR REPLACE FUNCTION winelio.trg_feed_preferences_sync_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.share_activity IS FALSE THEN
    -- Retirer la publication d'accueil du membre s'il masque son activité
    DELETE FROM winelio.messaging_messages
    WHERE welcome_member_id = NEW.user_id;

    -- Anonymiser la mention du parrain sur les messages d'accueil de ses filleuls s'il masque son activité
    UPDATE winelio.messaging_messages m
    SET
      welcome_sponsor_id = NULL,
      content = '👋 Bienvenue à ' ||
        winelio.messaging_display_name(p.first_name, p.last_name) ||
        ' qui rejoint la communauté Winelio ! Souhaitez-lui la bienvenue 👏'
    FROM winelio.profiles p
    WHERE m.welcome_sponsor_id = NEW.user_id
      AND p.id = m.welcome_member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_winelio_feed_prefs_sync_welcome ON winelio.feed_preferences;
CREATE TRIGGER trg_winelio_feed_prefs_sync_welcome
  AFTER INSERT OR UPDATE OF share_activity ON winelio.feed_preferences
  FOR EACH ROW
  EXECUTE FUNCTION winelio.trg_feed_preferences_sync_welcome();

COMMIT;
