-- Droit d'opposition RGPD Art. 21 : permet à l'utilisateur de masquer sa photo de profil
-- aux membres de son réseau (sponsor direct), tout en la conservant uploadée.
-- Par défaut visible (continuité avec le comportement actuel).

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS avatar_visible_to_network boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN winelio.profiles.avatar_visible_to_network IS
  'RGPD Art. 21 : si false, la photo de profil n''est servie qu''au propriétaire et au super_admin, jamais au sponsor direct. Toggle dans /profile.';
