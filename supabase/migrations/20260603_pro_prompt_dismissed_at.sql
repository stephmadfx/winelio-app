ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS pro_prompt_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN winelio.profiles.pro_prompt_dismissed_at IS
  'Date a laquelle l utilisateur a choisi de ne plus afficher la popup demandant s il est professionnel.';
