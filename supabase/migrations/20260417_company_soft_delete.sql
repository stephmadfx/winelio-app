-- Soft delete pour les entreprises
ALTER TABLE winelio.companies ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index pour exclure rapidement les entreprises supprimées
CREATE INDEX IF NOT EXISTS companies_deleted_at_idx ON winelio.companies (deleted_at) WHERE deleted_at IS NULL;
