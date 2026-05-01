-- Stocke le code NAF/APE renvoyé par l'API SIRENE au moment de la création/onboarding.
-- Sert au verrou côté édition (modifiable uniquement via support) et au filtrage métier
-- (seules les activités de prestation de service peuvent s'inscrire en pro).
-- Les règles NAF sont en TS (lib/naf-rules.ts) — pas de table DB pour ce référentiel quasi-figé.
ALTER TABLE winelio.companies
  ADD COLUMN IF NOT EXISTS naf_code TEXT;

CREATE INDEX IF NOT EXISTS companies_naf_code_idx ON winelio.companies (naf_code);
