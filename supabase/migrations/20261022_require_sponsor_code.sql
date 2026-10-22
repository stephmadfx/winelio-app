-- Inscription Winelio : code valide obligatoire, y compris via GoTrue directement.
-- Les comptes et rattachements existants ne sont pas modifiés.
BEGIN;

-- Protège aussi une insertion directe de profil après une inscription GoTrue
-- sans marqueur Winelio : le code reste obligatoire pour entrer dans ce réseau.
CREATE OR REPLACE FUNCTION winelio.enforce_new_profile_sponsor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, pg_catalog
AS $$
DECLARE
  code text;
  sponsor uuid;
BEGIN
  -- Un upsert d’un compte existant ne constitue pas une nouvelle inscription.
  IF EXISTS (SELECT 1 FROM winelio.profiles WHERE id = NEW.id) THEN RETURN NEW; END IF;
  SELECT upper(btrim(raw_user_meta_data->>'sponsor_code')) INTO code
  FROM auth.users WHERE id = NEW.id;
  IF code IS NULL OR code = '' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Un code de parrainage valide est obligatoire pour vous inscrire.';
  END IF;

  SELECT id INTO sponsor FROM winelio.profiles
  WHERE sponsor_code = code AND is_active = true AND id <> NEW.id
  FOR KEY SHARE;
  IF sponsor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Code de parrainage invalide.';
  END IF;
  NEW.sponsor_id := sponsor;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_new_profile_sponsor_trigger ON winelio.profiles;
CREATE TRIGGER enforce_new_profile_sponsor_trigger
BEFORE INSERT ON winelio.profiles
FOR EACH ROW EXECUTE FUNCTION winelio.enforce_new_profile_sponsor();

CREATE OR REPLACE FUNCTION winelio.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, pg_catalog
AS $$
DECLARE
  max_attempts int := 10;
  attempt int := 0;
BEGIN
  -- Filtre projet : seuls les users explicitement marqués 'winelio' obtiennent un profile.
  IF NEW.raw_user_meta_data->>'app' IS DISTINCT FROM 'winelio' THEN
    RETURN NEW;
  END IF;

  -- Insertion du profil
  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO winelio.profiles (
        id,
        email,
        first_name,
        last_name,
        phone,
        address,
        city,
        postal_code,
        birth_date,
        terms_accepted,
        sponsor_code,
        sponsor_id
      )
      VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'address',
        NEW.raw_user_meta_data->>'city',
        NEW.raw_user_meta_data->>'postal_code',
        CASE
          WHEN NEW.raw_user_meta_data->>'birth_date' IS NOT NULL
               AND NEW.raw_user_meta_data->>'birth_date' <> ''
          THEN (NEW.raw_user_meta_data->>'birth_date')::date
          ELSE NULL
        END,
        COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
        winelio.generate_unique_sponsor_code(),
        NULL
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'Impossible de générer un code parrain unique après % tentatives', max_attempts;
      END IF;
    END;
  END LOOP;

  -- Initialisation du résumé du portefeuille
  INSERT INTO winelio.user_wallet_summaries (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMIT;
