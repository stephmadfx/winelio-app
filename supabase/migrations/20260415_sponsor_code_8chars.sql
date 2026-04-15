-- Migration : codes parrain 8 caractères alphanumériques avec retry
-- Remplace la génération md5(random()) 6 chars hexadécimaux
-- Espace : 36^8 = 2 821 109 907 456 combinaisons (A-Z + 0-9)

-- ============================================================
-- 1. Fonction de génération avec retry
-- ============================================================

CREATE OR REPLACE FUNCTION winelio.generate_unique_sponsor_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code   text;
  taken  boolean;
BEGIN
  LOOP
    -- Génère 8 caractères aléatoires alphanumériques (A-Z, 0-9)
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * 36 + 1)::int, 1);
    END LOOP;

    -- Vérifie unicité : ni dans les profils actifs ni dans les codes supprimés
    SELECT EXISTS(
      SELECT 1 FROM winelio.profiles WHERE sponsor_code = code
      UNION ALL
      SELECT 1 FROM winelio.deleted_sponsor_codes WHERE code = code
    ) INTO taken;

    EXIT WHEN NOT taken;
  END LOOP;

  RETURN code;
END;
$$;

-- ============================================================
-- 2. Mise à jour du DEFAULT sur la colonne
-- ============================================================

ALTER TABLE winelio.profiles
  ALTER COLUMN sponsor_code
  SET DEFAULT winelio.generate_unique_sponsor_code();

-- ============================================================
-- 3. Mise à jour du trigger handle_new_user
--    (force l'appel explicite pour éviter tout conflit de timing)
-- ============================================================

CREATE OR REPLACE FUNCTION winelio.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO winelio.profiles (id, email, sponsor_code)
  VALUES (NEW.id, NEW.email, winelio.generate_unique_sponsor_code());

  INSERT INTO winelio.user_wallet_summaries (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;
