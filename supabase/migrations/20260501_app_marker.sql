-- Marquer chaque user créé via le flow Winelio dans raw_user_meta_data.app = 'winelio'.
-- Le trigger ne crée plus de profile Winelio pour les users d'autres projets partageant
-- la même instance Supabase Auth (Onibradio, Hesby, etc.).

CREATE OR REPLACE FUNCTION winelio.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  max_attempts int := 10;
  attempt int := 0;
BEGIN
  -- Filtre projet : seuls les users explicitement marqués 'winelio' obtiennent un profile.
  IF NEW.raw_user_meta_data->>'app' IS DISTINCT FROM 'winelio' THEN
    RETURN NEW;
  END IF;

  LOOP
    attempt := attempt + 1;
    BEGIN
      INSERT INTO winelio.profiles (id, email, sponsor_code)
      VALUES (NEW.id, NEW.email, winelio.generate_unique_sponsor_code());
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'Impossible de générer un code parrain unique après % tentatives', max_attempts;
      END IF;
    END;
  END LOOP;

  INSERT INTO winelio.user_wallet_summaries (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill : marque comme 'winelio' tous les users existants qui ont un profile Winelio.
-- N'écrase pas un marker existant.
UPDATE auth.users u
SET raw_user_meta_data = jsonb_set(
  COALESCE(u.raw_user_meta_data, '{}'::jsonb),
  '{app}',
  '"winelio"'::jsonb,
  true
)
WHERE EXISTS (SELECT 1 FROM winelio.profiles p WHERE p.id = u.id)
  AND COALESCE(u.raw_user_meta_data->>'app', '') <> 'winelio';
