-- Visite guidée première connexion : on stocke la date de fin de tour pour ne plus la déclencher.
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN winelio.profiles.tour_completed_at IS
  'Date de fin de la visite guidée du dashboard (driver.js). NULL = à afficher au prochain login.';
