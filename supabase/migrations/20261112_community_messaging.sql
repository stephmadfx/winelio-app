-- Migration 20261112 : Messagerie communautaire Winelio
-- Espace 1 : Canal national « Annonces Winelio » (publications super_admin, emojis, commentaires regroupés)
-- Espace 2 : Salons automatiques par Lignée (is_founder) et par Équipe (parrain >= 3 filleuls actifs)

BEGIN;

-- 1. Tables principales dans le schéma winelio
CREATE TABLE IF NOT EXISTS winelio.messaging_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('announcements', 'lineage', 'team')),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  owner_id uuid REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  allow_member_photos boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.messaging_memberships (
  channel_id uuid NOT NULL REFERENCES winelio.messaging_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'owner')),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  muted_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS messaging_memberships_user_idx
  ON winelio.messaging_memberships(user_id, channel_id);

CREATE TABLE IF NOT EXISTS winelio.messaging_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES winelio.messaging_channels(id) ON DELETE CASCADE,
  author_id uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  author_badge text NOT NULL DEFAULT 'member' CHECK (author_badge IN ('admin', 'founder', 'leader', 'pro', 'member')),
  parent_message_id uuid REFERENCES winelio.messaging_messages(id) ON DELETE CASCADE,
  title text CHECK (title IS NULL OR char_length(title) <= 140),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 2000),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments_enabled boolean NOT NULL DEFAULT true,
  reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    deleted_at IS NOT NULL
    OR char_length(btrim(content)) > 0
    OR jsonb_array_length(attachments) > 0
  )
);

CREATE INDEX IF NOT EXISTS messaging_messages_feed_idx
  ON winelio.messaging_messages(channel_id, created_at DESC, id DESC)
  WHERE parent_message_id IS NULL;

CREATE INDEX IF NOT EXISTS messaging_messages_replies_idx
  ON winelio.messaging_messages(parent_message_id, created_at ASC, id ASC)
  WHERE parent_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messaging_messages_author_idx
  ON winelio.messaging_messages(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS winelio.messaging_reactions (
  message_id uuid NOT NULL REFERENCES winelio.messaging_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '👏', '🔥', '❤️', '🎉', '💡')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS winelio.messaging_pins (
  channel_id uuid NOT NULL REFERENCES winelio.messaging_channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES winelio.messaging_messages(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, message_id)
);

CREATE TABLE IF NOT EXISTS winelio.messaging_preferences (
  user_id uuid PRIMARY KEY REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  in_app_badges boolean NOT NULL DEFAULT true,
  email_major_announcements boolean NOT NULL DEFAULT true,
  charter_accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.messaging_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES winelio.messaging_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES winelio.messaging_channels(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'personal_data', 'misleading', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS messaging_reports_status_idx
  ON winelio.messaging_reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS winelio.messaging_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES winelio.messaging_channels(id) ON DELETE CASCADE,
  restricted_until timestamptz NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  created_by uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messaging_restrictions_user_idx
  ON winelio.messaging_restrictions(user_id, restricted_until DESC);

-- 2. Fonctions utilitaires métier et sécurité
CREATE OR REPLACE FUNCTION winelio.messaging_display_name(p_first text, p_last text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(btrim(p_first), ''), 'Membre') ||
    CASE
      WHEN nullif(btrim(p_last), '') IS NOT NULL
        THEN ' ' || upper(left(btrim(p_last), 1)) || '.'
      ELSE ''
    END;
$$;

CREATE OR REPLACE FUNCTION winelio.is_eligible_messaging_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM winelio.profiles p
    WHERE p.id = p_user_id
      AND p.is_active IS TRUE
      AND p.is_demo IS NOT TRUE
      AND p.id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND coalesce(p.email, '') !~* '@(winelio-demo\.internal|winelio-scraped\.local|winelio-e2e\.local|mailsac\.com)$'
  );
$$;

CREATE OR REPLACE FUNCTION winelio.can_access_messaging_channel(p_user_id uuid, p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL AND p_channel_id IS NOT NULL AND (
    coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'super_admin'
    OR (
      winelio.is_eligible_messaging_member(p_user_id)
      AND EXISTS (
        SELECT 1
        FROM winelio.messaging_memberships m
        JOIN winelio.messaging_channels c ON c.id = m.channel_id
        WHERE m.channel_id = p_channel_id
          AND m.user_id = p_user_id
          AND c.is_archived IS FALSE
      )
    )
  );
$$;

-- Synchronisation auto-cicatrisante des salons d'un membre (Annonces + Lignée fondatrice + Équipe >= 3 filleuls)
CREATE OR REPLACE FUNCTION winelio.sync_user_messaging_channels(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_announcements_id uuid;
  v_founder_id uuid;
  v_founder_first text;
  v_founder_last text;
  v_lineage_id uuid;
  v_sponsor_id uuid;
  v_sponsor_first text;
  v_sponsor_last text;
  v_sponsor_n1_count integer;
  v_sponsor_team_id uuid;
  v_own_first text;
  v_own_last text;
  v_own_n1_count integer;
  v_own_team_id uuid;
BEGIN
  -- S'assurer que le canal national existe toujours
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

  IF p_user_id IS NULL OR NOT winelio.is_eligible_messaging_member(p_user_id) THEN
    RETURN;
  END IF;

  -- 1) Adhésion au canal national Annonces Winelio
  INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
  VALUES (v_announcements_id, p_user_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  -- Lire le profil courant
  SELECT p.sponsor_id, p.first_name, p.last_name
  INTO v_sponsor_id, v_own_first, v_own_last
  FROM winelio.profiles p
  WHERE p.id = p_user_id;

  -- 2) Recherche de la tête de lignée (is_founder = true) en remontant sponsor_id (anti-cycle)
  WITH RECURSIVE ancestors AS (
    SELECT p.id, p.sponsor_id, p.is_founder, p.first_name, p.last_name, 0 AS hops, ARRAY[p.id] AS visited
    FROM winelio.profiles p
    WHERE p.id = p_user_id
    UNION ALL
    SELECT parent.id, parent.sponsor_id, parent.is_founder, parent.first_name, parent.last_name, a.hops + 1, a.visited || parent.id
    FROM ancestors a
    JOIN winelio.profiles parent ON parent.id = a.sponsor_id
    WHERE a.is_founder IS NOT TRUE
      AND a.hops < 25
      AND NOT (parent.id = ANY(a.visited))
  )
  SELECT a.id, a.first_name, a.last_name
  INTO v_founder_id, v_founder_first, v_founder_last
  FROM ancestors a
  WHERE a.is_founder IS TRUE AND winelio.is_eligible_messaging_member(a.id)
  ORDER BY a.hops ASC
  LIMIT 1;

  IF v_founder_id IS NOT NULL THEN
    INSERT INTO winelio.messaging_channels (kind, slug, name, description, owner_id, allow_member_photos)
    VALUES (
      'lineage',
      'lineage-' || v_founder_id::text,
      'Lignée ' || winelio.messaging_display_name(v_founder_first, v_founder_last),
      'Espace d’entraide et de partage de toute votre lignée Winelio.',
      v_founder_id,
      true
    )
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name
    RETURNING id INTO v_lineage_id;

    INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
    VALUES (
      v_lineage_id,
      p_user_id,
      CASE WHEN p_user_id = v_founder_id THEN 'moderator' ELSE 'member' END
    )
    ON CONFLICT (channel_id, user_id) DO UPDATE
      SET role = CASE WHEN p_user_id = v_founder_id THEN 'moderator' ELSE winelio.messaging_memberships.role END;

    -- Nettoyer toute adhésion obsolète à une autre lignée
    DELETE FROM winelio.messaging_memberships m
    USING winelio.messaging_channels c
    WHERE m.channel_id = c.id
      AND m.user_id = p_user_id
      AND c.kind = 'lineage'
      AND c.id <> v_lineage_id;
  END IF;

  -- 3) Salon d'équipe du parrain direct (si >= 3 filleuls directs réels actifs)
  IF v_sponsor_id IS NOT NULL AND winelio.is_eligible_messaging_member(v_sponsor_id) THEN
    SELECT p.first_name, p.last_name,
      (
        SELECT count(*)::integer
        FROM winelio.profiles child
        WHERE child.sponsor_id = v_sponsor_id
          AND child.id <> v_sponsor_id
          AND winelio.is_eligible_messaging_member(child.id)
      )
    INTO v_sponsor_first, v_sponsor_last, v_sponsor_n1_count
    FROM winelio.profiles p
    WHERE p.id = v_sponsor_id;

    IF coalesce(v_sponsor_n1_count, 0) >= 3 OR EXISTS (
      SELECT 1 FROM winelio.messaging_channels WHERE slug = 'team-' || v_sponsor_id::text AND is_archived IS FALSE
    ) THEN
      INSERT INTO winelio.messaging_channels (kind, slug, name, description, owner_id, allow_member_photos)
      VALUES (
        'team',
        'team-' || v_sponsor_id::text,
        'Équipe de ' || winelio.messaging_display_name(v_sponsor_first, v_sponsor_last),
        'Groupe de proximité entre votre parrain et ses filleuls directs.',
        v_sponsor_id,
        true
      )
      ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name
      RETURNING id INTO v_sponsor_team_id;

      INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
      VALUES (v_sponsor_team_id, v_sponsor_id, 'owner')
      ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'owner';

      INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
      VALUES (v_sponsor_team_id, p_user_id, 'member')
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;
  END IF;

  -- 4) Salon d'équipe propre du membre s'il est lui-même parrain de >= 3 filleuls directs réels actifs
  SELECT count(*)::integer
  INTO v_own_n1_count
  FROM winelio.profiles child
  WHERE child.sponsor_id = p_user_id
    AND child.id <> p_user_id
    AND winelio.is_eligible_messaging_member(child.id);

  IF coalesce(v_own_n1_count, 0) >= 3 OR EXISTS (
    SELECT 1 FROM winelio.messaging_channels WHERE slug = 'team-' || p_user_id::text AND is_archived IS FALSE
  ) THEN
    INSERT INTO winelio.messaging_channels (kind, slug, name, description, owner_id, allow_member_photos)
    VALUES (
      'team',
      'team-' || p_user_id::text,
      'Équipe de ' || winelio.messaging_display_name(v_own_first, v_own_last),
      'Groupe de proximité avec vos filleuls directs.',
      p_user_id,
      true
    )
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name
    RETURNING id INTO v_own_team_id;

    INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
    VALUES (v_own_team_id, p_user_id, 'owner')
    ON CONFLICT (channel_id, user_id) DO UPDATE SET role = 'owner';

    INSERT INTO winelio.messaging_memberships (channel_id, user_id, role)
    SELECT v_own_team_id, child.id, 'member'
    FROM winelio.profiles child
    WHERE child.sponsor_id = p_user_id
      AND child.id <> p_user_id
      AND winelio.is_eligible_messaging_member(child.id)
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  -- Nettoyer d'éventuelles adhésions d'équipe obsolètes (ex. après compression de parrain)
  DELETE FROM winelio.messaging_memberships m
  USING winelio.messaging_channels c
  WHERE m.channel_id = c.id
    AND m.user_id = p_user_id
    AND c.kind = 'team'
    AND c.owner_id IS DISTINCT FROM p_user_id
    AND c.owner_id IS DISTINCT FROM v_sponsor_id;
END;
$$;

-- Synchronisation globale de tous les membres éligibles (admin / initialisation)
CREATE OR REPLACE FUNCTION winelio.sync_all_messaging_channels()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.id
    FROM winelio.profiles p
    WHERE winelio.is_eligible_messaging_member(p.id)
  LOOP
    PERFORM winelio.sync_user_messaging_channels(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Diffusion temps réel privée via Supabase Realtime Broadcast (sans saturer WAL postgres_changes)
CREATE OR REPLACE FUNCTION winelio.broadcast_messaging_event(
  p_channel_id uuid,
  p_event text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_channel_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM realtime.send(
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('channelId', p_channel_id, 'ts', extract(epoch FROM now())),
    coalesce(nullif(p_event, ''), 'messaging_update'),
    'winelio-msg:' || p_channel_id::text,
    true
  );
EXCEPTION WHEN OTHERS THEN
  -- Un aléa du bus temps réel ne doit jamais faire échouer l'écriture d'un message
  NULL;
END;
$$;

-- 3. Droits et Row Level Security (verrouillage strict anti-IDOR)
ALTER TABLE winelio.messaging_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.messaging_restrictions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  winelio.messaging_channels,
  winelio.messaging_memberships,
  winelio.messaging_messages,
  winelio.messaging_reactions,
  winelio.messaging_pins,
  winelio.messaging_preferences,
  winelio.messaging_reports,
  winelio.messaging_restrictions
FROM PUBLIC, anon, authenticated;

-- Lecture autorisée aux membres authentifiés selon leur appartenance exacte ; mutations via API serveur validée
GRANT SELECT ON
  winelio.messaging_channels,
  winelio.messaging_memberships,
  winelio.messaging_messages,
  winelio.messaging_reactions,
  winelio.messaging_pins,
  winelio.messaging_preferences
TO authenticated;

GRANT ALL ON
  winelio.messaging_channels,
  winelio.messaging_memberships,
  winelio.messaging_messages,
  winelio.messaging_reactions,
  winelio.messaging_pins,
  winelio.messaging_preferences,
  winelio.messaging_reports,
  winelio.messaging_restrictions
TO service_role;

DROP POLICY IF EXISTS messaging_channels_select ON winelio.messaging_channels;
CREATE POLICY messaging_channels_select
  ON winelio.messaging_channels
  FOR SELECT TO authenticated
  USING (winelio.can_access_messaging_channel(auth.uid(), id));

DROP POLICY IF EXISTS messaging_memberships_select ON winelio.messaging_memberships;
CREATE POLICY messaging_memberships_select
  ON winelio.messaging_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'super_admin');

DROP POLICY IF EXISTS messaging_messages_select ON winelio.messaging_messages;
CREATE POLICY messaging_messages_select
  ON winelio.messaging_messages
  FOR SELECT TO authenticated
  USING (winelio.can_access_messaging_channel(auth.uid(), channel_id));

DROP POLICY IF EXISTS messaging_reactions_select ON winelio.messaging_reactions;
CREATE POLICY messaging_reactions_select
  ON winelio.messaging_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM winelio.messaging_messages msg
      WHERE msg.id = message_id
        AND winelio.can_access_messaging_channel(auth.uid(), msg.channel_id)
    )
  );

DROP POLICY IF EXISTS messaging_pins_select ON winelio.messaging_pins;
CREATE POLICY messaging_pins_select
  ON winelio.messaging_pins
  FOR SELECT TO authenticated
  USING (winelio.can_access_messaging_channel(auth.uid(), channel_id));

DROP POLICY IF EXISTS messaging_preferences_select ON winelio.messaging_preferences;
CREATE POLICY messaging_preferences_select
  ON winelio.messaging_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON FUNCTION winelio.messaging_display_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION winelio.messaging_display_name(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION winelio.is_eligible_messaging_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION winelio.is_eligible_messaging_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION winelio.can_access_messaging_channel(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION winelio.can_access_messaging_channel(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION winelio.sync_user_messaging_channels(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.sync_user_messaging_channels(uuid) TO service_role;

REVOKE ALL ON FUNCTION winelio.sync_all_messaging_channels() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.sync_all_messaging_channels() TO service_role;

REVOKE ALL ON FUNCTION winelio.broadcast_messaging_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.broadcast_messaging_event(uuid, text, jsonb) TO service_role;

-- 4. Politique RLS sur realtime.messages pour verrouiller l'écoute WebSocket privée par salon
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS winelio_messaging_broadcast_select ON realtime.messages';
    EXECUTE $pol$
      CREATE POLICY winelio_messaging_broadcast_select
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        extension = 'broadcast'
        AND realtime.topic() LIKE 'winelio-msg:%'
        AND substring(realtime.topic() FROM 13) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND winelio.can_access_messaging_channel(
          auth.uid(),
          (substring(realtime.topic() FROM 13))::uuid
        )
      )
    $pol$;
  END IF;
END;
$$;

-- 5. Initialisation immédiate des salons sur le réseau réel existant
SELECT winelio.sync_all_messaging_channels();

NOTIFY pgrst, 'reload schema';

COMMIT;
