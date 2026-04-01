-- Add unique alias column to companies
-- Nullable first to allow backfill of existing rows
ALTER TABLE companies ADD COLUMN IF NOT EXISTS alias VARCHAR(7);
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_alias ON companies(alias);
