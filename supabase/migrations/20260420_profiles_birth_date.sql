-- Ajout de la date de naissance pour la vérification d'âge (18+)
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS birth_date date
    CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years');
