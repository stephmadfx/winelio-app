-- Migration : update handle_new_user trigger to support direct profile fields (first_name, last_name, phone)
-- and sponsor_id assignment from raw_user_meta_data during signUp.

CREATE OR REPLACE FUNCTION winelio.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  max_attempts int := 10;
  attempt int := 0;
  v_sponsor_id uuid := null;
  v_last_founder_id uuid;
  v_next_founder_id uuid;
BEGIN
  -- Filtre projet : seuls les users explicitement marqués 'winelio' obtiennent un profile.
  IF NEW.raw_user_meta_data->>'app' IS DISTINCT FROM 'winelio' THEN
    RETURN NEW;
  END IF;

  -- 1. Récupération du sponsor_id depuis raw_user_meta_data
  IF NEW.raw_user_meta_data->>'sponsor_id' IS NOT NULL THEN
    v_sponsor_id := (NEW.raw_user_meta_data->>'sponsor_id')::uuid;
  END IF;

  -- 2. Récupération du sponsor_id par code si non fourni directement
  IF v_sponsor_id IS NULL AND NEW.raw_user_meta_data->>'sponsor_code' IS NOT NULL THEN
    SELECT id INTO v_sponsor_id 
    FROM winelio.profiles 
    WHERE sponsor_code = NEW.raw_user_meta_data->>'sponsor_code' 
      AND id <> NEW.id;
  END IF;

  -- 3. Rotation des fondateurs si aucun parrain n'est défini
  IF v_sponsor_id IS NULL THEN
    SELECT last_founder_id INTO v_last_founder_id 
    FROM winelio.founder_rotation 
    WHERE id = 1;

    SELECT id INTO v_next_founder_id
    FROM winelio.profiles
    WHERE is_founder = true AND id <> NEW.id
    ORDER BY 
      CASE 
        WHEN v_last_founder_id IS NULL THEN 1
        WHEN id > v_last_founder_id THEN 0
        ELSE 1 
      END, 
      id
    LIMIT 1;

    IF v_next_founder_id IS NOT NULL THEN
      v_sponsor_id := v_next_founder_id;
      
      INSERT INTO winelio.founder_rotation (id, last_founder_id, updated_at)
      VALUES (1, v_next_founder_id, now())
      ON CONFLICT (id) DO UPDATE SET 
        last_founder_id = EXCLUDED.last_founder_id, 
        updated_at = now();
    END IF;
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
        sponsor_code, 
        sponsor_id
      )
      VALUES (
        NEW.id, 
        NEW.email, 
        NEW.raw_user_meta_data->>'first_name', 
        NEW.raw_user_meta_data->>'last_name', 
        NEW.raw_user_meta_data->>'phone', 
        winelio.generate_unique_sponsor_code(),
        v_sponsor_id
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
