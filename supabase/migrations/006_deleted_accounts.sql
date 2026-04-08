-- ============================================================
-- Winelio - Table des codes parrain supprimés
-- Un code supprimé ne peut jamais être réattribué à un nouveau compte
-- ============================================================

CREATE TABLE IF NOT EXISTS winelio.deleted_sponsor_codes (
    sponsor_code TEXT PRIMARY KEY,
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commentaire explicatif
COMMENT ON TABLE winelio.deleted_sponsor_codes IS
  'Codes parrain issus de comptes supprimés — ne jamais réutiliser ces codes lors de la création de nouveaux profils';

-- RLS : lecture publique (pour valider lors de l''inscription), écriture service_role uniquement
ALTER TABLE winelio.deleted_sponsor_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture publique deleted_sponsor_codes"
  ON winelio.deleted_sponsor_codes
  FOR SELECT
  USING (true);
