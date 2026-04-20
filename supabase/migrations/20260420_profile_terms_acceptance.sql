-- Acceptation des CGU Winelio lors de la complétion du profil
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
