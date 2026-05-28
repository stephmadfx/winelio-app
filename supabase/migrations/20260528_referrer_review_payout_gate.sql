-- Conditionne le paiement du recommandeur a un avis qualifie apres paiement pro.

ALTER TABLE winelio.reviews
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

ALTER TABLE winelio.reviews
  DROP CONSTRAINT IF EXISTS reviews_status_check;

ALTER TABLE winelio.reviews
  ADD CONSTRAINT reviews_status_check
  CHECK (status IN ('published', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_recommendation_reviewer
  ON winelio.reviews (recommendation_id, reviewer_id);

CREATE INDEX IF NOT EXISTS idx_reviews_recommendation_status
  ON winelio.reviews (recommendation_id, status);
