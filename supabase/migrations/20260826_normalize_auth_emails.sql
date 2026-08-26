-- Normalisation des emails d'authentification.
--
-- /api/auth/send-code stocke le code OTP sur l'email canonique (trim + lower),
-- mais verify-code et reset-password interrogeaient otp_codes et auth.users avec
-- la saisie brute. En SQL, `=` est sensible à la casse : un seul caractère
-- majuscule rendait le code introuvable ("Code invalide ou expiré") et l'UPDATE
-- du mot de passe sans effet ("Aucun compte associé à cet email").
--
-- Un compte dont l'email est stocké avec une majuscule dans auth.users était
-- donc verrouillé des deux côtés : impossible de définir un mot de passe via
-- « mot de passe oublié », et GoTrue (qui minusculise avant lookup) refusait
-- aussi la connexion par mot de passe.
--
-- Les routes sont corrigées côté code ; cette migration remet les données
-- existantes en forme canonique et empêche toute nouvelle ligne otp_codes
-- d'échapper à la règle.

BEGIN;

-- Codes périmés saisis avec une casse mixte : inutilisables, on les purge.
DELETE FROM winelio.otp_codes
WHERE email <> lower(email);

-- Garde-fou : quelle que soit la route appelante, la clé reste canonique.
CREATE OR REPLACE FUNCTION winelio.normalize_otp_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = winelio, pg_temp
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_otp_email ON winelio.otp_codes;
CREATE TRIGGER trg_normalize_otp_email
  BEFORE INSERT OR UPDATE OF email ON winelio.otp_codes
  FOR EACH ROW
  EXECUTE FUNCTION winelio.normalize_otp_email();

-- Comptes existants. Vérifié au préalable : aucune collision une fois
-- l'ensemble minusculisé, la mise à jour ne peut pas violer l'unicité.
UPDATE auth.identities i
SET identity_data = jsonb_set(
      i.identity_data,
      '{email}',
      to_jsonb(lower(i.identity_data->>'email'))
    ),
    updated_at = now()
WHERE i.identity_data->>'email' IS NOT NULL
  AND i.identity_data->>'email' <> lower(i.identity_data->>'email')
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = i.user_id
      AND u.raw_user_meta_data->>'app' = 'winelio'
  );

UPDATE auth.users
SET email = lower(email),
    updated_at = now()
WHERE email <> lower(email)
  AND raw_user_meta_data->>'app' = 'winelio';

UPDATE winelio.profiles
SET email = lower(email)
WHERE email <> lower(email);

COMMIT;
