-- ============================================================
-- Normalise les valeurs NULL héritées dans auth.users
-- ============================================================
-- GoTrue récent (v2.18+) attend des chaînes vides '' sur les
-- colonnes token héritées du schéma legacy. Quand ces colonnes
-- sont NULL pour un user, l'API admin /auth/v1/admin/users
-- (listUsers) plante avec "Database error finding users",
-- ce qui empêche d'utiliser auth.admin depuis nos scripts E2E.
--
-- Cause racine : 3 lignes auth.users insérées manuellement
-- (testlocal@winelio.app, test-fille-winelio@yopmail.com,
--  testmojvsv86@deltajohnsons.com) sans renseigner ces tokens.
--
-- Le cas est déjà géré côté code dans /api/auth/verify-code
-- (upsert auth.users avec '' partout), mais ces 3 lignes
-- existaient avant le déploiement de cette correction.

UPDATE auth.users
SET
  instance_id                = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'),
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE
  instance_id IS NULL
  OR confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change_token_new IS NULL
  OR email_change IS NULL
  OR email_change_token_current IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;
