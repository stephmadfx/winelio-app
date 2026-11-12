-- Migration 20261112c :
-- 1. Réactions style Messenger / Facebook (1 seule réaction maximum par utilisateur et par message)
-- 2. Ouverture des messages communautaires ('post') à tous les membres éligibles + Annonces officielles ('announcement') pour les Super Admins
-- 3. Modération avec trace permanente visible (suppression auteur, masquage modération, suppression modération) + étude par les 3 Super Admins

BEGIN;

-- 1. Réactions : 1 seule réaction par (message_id, user_id) + palette Messenger/Facebook
DELETE FROM winelio.messaging_reactions r
USING (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY message_id, user_id
           ORDER BY created_at DESC
         ) AS rn
  FROM winelio.messaging_reactions
) dup
WHERE r.ctid = dup.ctid
  AND dup.rn > 1;

ALTER TABLE winelio.messaging_reactions
  DROP CONSTRAINT IF EXISTS messaging_reactions_pkey;

ALTER TABLE winelio.messaging_reactions
  ADD CONSTRAINT messaging_reactions_pkey PRIMARY KEY (message_id, user_id);

ALTER TABLE winelio.messaging_reactions
  DROP CONSTRAINT IF EXISTS messaging_reactions_emoji_check;

ALTER TABLE winelio.messaging_reactions
  ADD CONSTRAINT messaging_reactions_emoji_check
  CHECK (emoji IN ('👍', '❤️', '😂', '😮', '👏', '🔥', '🎉', '💡'));

-- 2. Distinction Annonce officielle ('announcement') vs Message membre ('post') vs Bienvenue ('welcome')
ALTER TABLE winelio.messaging_messages
  DROP CONSTRAINT IF EXISTS messaging_messages_message_type_check;

ALTER TABLE winelio.messaging_messages
  ADD CONSTRAINT messaging_messages_message_type_check
  CHECK (message_type IN ('announcement', 'post', 'welcome'));

UPDATE winelio.messaging_messages
SET message_type = 'announcement'
WHERE parent_message_id IS NULL
  AND message_type = 'post'
  AND author_badge = 'admin';

-- 3. États de suppression / masquage avec trace visible et archive réservée aux Super Admins
ALTER TABLE winelio.messaging_messages
  ADD COLUMN IF NOT EXISTS moderation_state text NOT NULL DEFAULT 'active'
    CHECK (moderation_state IN ('active', 'masked_admin', 'deleted_author', 'deleted_admin')),
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_reason text
    CHECK (moderation_reason IS NULL OR char_length(moderation_reason) <= 300),
  ADD COLUMN IF NOT EXISTS archived_content text;

UPDATE winelio.messaging_messages
SET moderation_state = CASE
  WHEN deleted_by IS NOT NULL AND deleted_by = author_id THEN 'deleted_author'
  ELSE 'deleted_admin'
END,
moderated_at = coalesce(moderated_at, deleted_at),
moderated_by = coalesce(moderated_by, deleted_by)
WHERE deleted_at IS NOT NULL
  AND moderation_state = 'active';

ALTER TABLE winelio.messaging_messages
  DROP CONSTRAINT IF EXISTS messaging_messages_check;

ALTER TABLE winelio.messaging_messages
  ADD CONSTRAINT messaging_messages_check
  CHECK (
    deleted_at IS NOT NULL
    OR moderation_state <> 'active'
    OR char_length(btrim(content)) > 0
    OR jsonb_array_length(attachments) > 0
  );

-- 4. Motif explicite "Contenu non conforme" pour les signalements étudiés par les 3 Super Admins
ALTER TABLE winelio.messaging_reports
  DROP CONSTRAINT IF EXISTS messaging_reports_reason_check;

ALTER TABLE winelio.messaging_reports
  ADD CONSTRAINT messaging_reports_reason_check
  CHECK (reason IN ('non_compliant', 'spam', 'inappropriate', 'personal_data', 'misleading', 'other'));

-- 5. Espace national ouvert aux échanges communautaires + photos autorisées
UPDATE winelio.messaging_channels
SET
  name = 'Communauté Winelio',
  description = 'Messages de la communauté, annonces officielles et accueil des nouveaux inscrits.',
  allow_member_photos = true,
  updated_at = now()
WHERE slug = 'national-announcements';

-- 6. Fonction interne (service_role uniquement) listant les Super Admins habilités à étudier les signalements
CREATE OR REPLACE FUNCTION winelio.get_super_admin_reviewers()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    u.id AS user_id,
    coalesce(u.email, '') AS email,
    winelio.messaging_display_name(p.first_name, p.last_name) AS display_name
  FROM auth.users u
  LEFT JOIN winelio.profiles p ON p.id = u.id
  WHERE coalesce(u.raw_app_meta_data->>'role', '') = 'super_admin'
  ORDER BY u.created_at ASC;
$$;

REVOKE ALL ON FUNCTION winelio.get_super_admin_reviewers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.get_super_admin_reviewers() TO service_role;

COMMIT;
