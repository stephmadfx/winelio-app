-- Migration : fix race condition sur handle_new_user
-- Ajoute un handler d'exception pour les collisions concurrent sur sponsor_code
-- En cas de violation UNIQUE à l'INSERT, retente avec un nouveau code (max 10 fois)

CREATE OR REPLACE FUNCTION winelio.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  max_attempts int := 10;
  attempt      int := 0;
BEGIN
  -- Boucle de retry en cas de race condition sur sponsor_code
  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO winelio.profiles (id, email, sponsor_code)
      VALUES (NEW.id, NEW.email, winelio.generate_unique_sponsor_code());
      EXIT; -- succès → sortir de la boucle
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'Impossible de générer un code parrain unique après % tentatives', max_attempts;
      END IF;
      -- collision → retente avec un nouveau code
    END;
  END LOOP;

  INSERT INTO winelio.user_wallet_summaries (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;
