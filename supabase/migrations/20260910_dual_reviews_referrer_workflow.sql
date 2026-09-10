BEGIN;

ALTER TABLE winelio.reviews ALTER COLUMN reviewer_id DROP NOT NULL;
ALTER TABLE winelio.reviews
  ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT 'referrer',
  ADD COLUMN IF NOT EXISTS notification_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS professional_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE winelio.reviews ADD CONSTRAINT reviews_author_role_check
  CHECK ((author_role = 'referrer' AND reviewer_id IS NOT NULL) OR (author_role = 'client' AND reviewer_id IS NULL));
ALTER TABLE winelio.reviews ADD CONSTRAINT reviews_reply_check
  CHECK (professional_reply IS NULL OR (length(trim(comment)) > 0 AND length(trim(professional_reply)) BETWEEN 1 AND 5000 AND replied_at IS NOT NULL));
CREATE UNIQUE INDEX reviews_one_client_per_recommendation ON winelio.reviews(recommendation_id) WHERE author_role = 'client';

-- Les écritures passent exclusivement par les routes serveur : contrôle du rôle,
-- du paiement et de la recommandation, aucune insertion directe depuis le client.
DROP POLICY IF EXISTS reviews_insert ON winelio.reviews;
REVOKE INSERT, UPDATE, DELETE ON winelio.reviews FROM anon, authenticated;

CREATE TABLE winelio.review_invitations (
  recommendation_id uuid PRIMARY KEY REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);
ALTER TABLE winelio.review_invitations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON winelio.review_invitations TO service_role;

CREATE TABLE winelio.review_delivery_jobs (
  recommendation_id uuid PRIMARY KEY REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  queued_at timestamptz,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE winelio.review_delivery_jobs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON winelio.review_delivery_jobs TO service_role;
CREATE FUNCTION winelio.schedule_review_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = winelio, public AS $$
BEGIN
  IF NEW.status = 'COMPLETED' THEN
    INSERT INTO winelio.review_delivery_jobs(recommendation_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recommendation_review_delivery AFTER INSERT OR UPDATE OF status ON winelio.recommendations
FOR EACH ROW EXECUTE FUNCTION winelio.schedule_review_delivery();

CREATE OR REPLACE VIEW winelio.professional_review_summaries AS
SELECT professional_id, round(avg(rating)::numeric, 1) AS avg_rating, count(rating)::integer AS review_count
FROM winelio.reviews WHERE status = 'published' AND rating BETWEEN 1 AND 5
GROUP BY professional_id;
GRANT SELECT ON winelio.professional_review_summaries TO authenticated, service_role;

COMMIT;
