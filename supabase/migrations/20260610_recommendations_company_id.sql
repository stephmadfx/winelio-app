-- Lie chaque recommandation à la fiche entreprise (activité) choisie à la création.
-- Un pro multi-activités a une fiche par activité : sans ce lien, les emails
-- de notification affichaient la première fiche active du pro, potentiellement
-- la mauvaise activité. Nullable : les recos antérieures gardent le fallback
-- "première fiche active" (resolveRecommendationCompany).

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES winelio.companies(id);

COMMENT ON COLUMN winelio.recommendations.company_id IS
  'Fiche entreprise (activité) visée par la recommandation. NULL = recos créées avant la colonne, fallback sur la première fiche active du pro.';

CREATE INDEX IF NOT EXISTS idx_recommendations_company_id
  ON winelio.recommendations (company_id);

-- Recharger le cache de schéma PostgREST pour exposer la nouvelle FK aux embeds.
NOTIFY pgrst, 'reload schema';
