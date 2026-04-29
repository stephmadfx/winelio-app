-- Migration : colonnes pour le transfert de recommandation
-- Ajout des champs nécessaires à la fonctionnalité "Transférer"

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS transferred_at      TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transfer_reason      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_recommendation_id UUID DEFAULT NULL
    REFERENCES winelio.recommendations(id) ON DELETE SET NULL;

-- Index pour retrouver rapidement les recos transférées
CREATE INDEX IF NOT EXISTS idx_recommendations_transferred_at
  ON winelio.recommendations(transferred_at)
  WHERE transferred_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recommendations_original_reco
  ON winelio.recommendations(original_recommendation_id)
  WHERE original_recommendation_id IS NOT NULL;
