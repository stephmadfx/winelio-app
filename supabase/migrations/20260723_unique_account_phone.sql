-- Un compte Winelio réel doit posséder un téléphone FR/BE unique.
-- Les profils issus du scraping restent exemptés : ils ne sont pas encore des comptes utilisateurs.

CREATE OR REPLACE FUNCTION winelio.normalize_phone_number(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
  trimmed_phone text;
BEGIN
  trimmed_phone := btrim(COALESCE(raw_phone, ''));
  IF trimmed_phone = '' THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(trimmed_phone, '[^0-9]', '', 'g');
  IF digits LIKE '00%' THEN
    digits := substring(digits FROM 3);
  ELSIF left(trimmed_phone, 1) <> '+' AND digits LIKE '0%' THEN
    digits := '33' || substring(digits FROM 2);
  END IF;

  IF digits ~ '^33[1-9][0-9]{8}$' OR digits ~ '^32[1-9][0-9]{7,8}$' THEN
    RETURN '+' || digits;
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS phone_normalized text;

UPDATE winelio.profiles
SET
  phone = winelio.normalize_phone_number(phone),
  phone_normalized = winelio.normalize_phone_number(phone)
WHERE phone IS NOT NULL
  AND btrim(phone) <> ''
  AND winelio.normalize_phone_number(phone) IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM winelio.profiles
    WHERE phone_normalized IS NOT NULL
    GROUP BY phone_normalized
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Des numéros de téléphone dupliqués doivent être résolus avant la création de la contrainte.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_normalized_unique
  ON winelio.profiles (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION winelio.enforce_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, auth, public
AS $$
DECLARE
  metadata jsonb;
  normalized text;
  is_real_winelio_account boolean := false;
BEGIN
  SELECT raw_user_meta_data
  INTO metadata
  FROM auth.users
  WHERE id = NEW.id;

  is_real_winelio_account :=
    metadata->>'app' = 'winelio'
    AND COALESCE((metadata->>'scraped')::boolean, false) = false;

  normalized := winelio.normalize_phone_number(NEW.phone);

  IF is_real_winelio_account AND normalized IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Un numéro de téléphone français ou belge valide est obligatoire.';
  END IF;

  NEW.phone := normalized;
  NEW.phone_normalized := normalized;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_phone_trigger ON winelio.profiles;
CREATE TRIGGER enforce_profile_phone_trigger
BEFORE INSERT OR UPDATE OF phone ON winelio.profiles
FOR EACH ROW
EXECUTE FUNCTION winelio.enforce_profile_phone();

CREATE OR REPLACE FUNCTION winelio.enforce_new_auth_user_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, auth, public
AS $$
DECLARE
  normalized text;
BEGIN
  IF NEW.raw_user_meta_data->>'app' = 'winelio'
     AND COALESCE((NEW.raw_user_meta_data->>'scraped')::boolean, false) = false THEN
    normalized := winelio.normalize_phone_number(NEW.raw_user_meta_data->>'phone');
    IF normalized IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Un numéro de téléphone français ou belge valide est obligatoire.';
    END IF;
    NEW.raw_user_meta_data := jsonb_set(NEW.raw_user_meta_data, '{phone}', to_jsonb(normalized), true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_new_auth_user_phone_trigger ON auth.users;
CREATE TRIGGER enforce_new_auth_user_phone_trigger
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION winelio.enforce_new_auth_user_phone();

COMMENT ON COLUMN winelio.profiles.phone_normalized IS
  'Téléphone canonique E.164 utilisé pour garantir un seul compte par numéro.';
