-- supabase/migrations/20260501_recommendation_followups.sql
-- Système de relances automatiques pro après acceptation d'une recommandation
-- Spec : docs/superpowers/specs/2026-05-01-relances-pro-recommandation-design.md

BEGIN;

-- 0. Fonction set_updated_at (n'existe pas encore dans le schéma winelio)
CREATE OR REPLACE FUNCTION winelio.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. Nouvelle table : suivi des relances pro
CREATE TABLE winelio.recommendation_followups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  after_step_order  smallint NOT NULL CHECK (after_step_order IN (2, 4, 5)),
  cycle_index       smallint NOT NULL CHECK (cycle_index BETWEEN 1 AND 3),
  scheduled_at      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','cancelled','superseded')),
  sent_at           timestamptz,
  report_count      smallint NOT NULL DEFAULT 0,
  cancel_reason     text,
  email_queue_id    uuid REFERENCES winelio.email_queue(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommendation_followups_due
  ON winelio.recommendation_followups (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_recommendation_followups_reco_step
  ON winelio.recommendation_followups (recommendation_id, after_step_order);

-- Une seule ligne pending par (reco, step) à la fois
CREATE UNIQUE INDEX recommendation_followups_one_pending_per_step
  ON winelio.recommendation_followups (recommendation_id, after_step_order)
  WHERE status = 'pending';

-- Trigger updated_at automatique (pattern existant dans winelio)
CREATE TRIGGER trg_recommendation_followups_updated_at
  BEFORE UPDATE ON winelio.recommendation_followups
  FOR EACH ROW EXECUTE FUNCTION winelio.set_updated_at();

-- 2. Nouvelles colonnes sur recommendations
ALTER TABLE winelio.recommendations
  ADD COLUMN expected_completion_at timestamptz,
  ADD COLUMN abandoned_by_pro_at    timestamptz;

COMMENT ON COLUMN winelio.recommendations.expected_completion_at IS
  'Date prévue de fin des travaux + paiement, saisie par le pro à l''étape 5. Programme la 1ère relance étape 5.';

COMMENT ON COLUMN winelio.recommendations.abandoned_by_pro_at IS
  'Date à laquelle le cycle de 3 relances s''est terminé sans action du pro.';

-- 3. Trigger : insertion auto des followups + cancel des pending
CREATE OR REPLACE FUNCTION winelio.handle_recommendation_step_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  step_order smallint;
  delay_int  interval;
  next_at    timestamptz;
BEGIN
  IF NEW.completed_at IS NULL OR (OLD IS NOT NULL AND OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT s.order_index INTO step_order
    FROM winelio.steps s WHERE s.id = NEW.step_id;

  -- Cancel TOUS les followups pending dont l'étape suivante est déjà complétée
  -- (couvre le saut d'étape : par ex. complétion étape 4 sans étape 3)
  UPDATE winelio.recommendation_followups
     SET status = 'cancelled', cancel_reason = 'next_step_done', updated_at = now()
   WHERE recommendation_id = NEW.recommendation_id
     AND status = 'pending'
     AND after_step_order < step_order;

  -- Crée un followup si l'étape complétée est 2, 4 ou 5
  IF step_order IN (2, 4) THEN
    delay_int := CASE WHEN step_order = 2 THEN interval '24 hours' ELSE interval '72 hours' END;
    next_at   := NEW.completed_at + delay_int;
    INSERT INTO winelio.recommendation_followups
      (recommendation_id, after_step_order, cycle_index, scheduled_at)
    VALUES (NEW.recommendation_id, step_order, 1, next_at)
    ON CONFLICT DO NOTHING;
  ELSIF step_order = 5 THEN
    SELECT expected_completion_at INTO next_at
      FROM winelio.recommendations WHERE id = NEW.recommendation_id;
    IF next_at IS NOT NULL THEN
      INSERT INTO winelio.recommendation_followups
        (recommendation_id, after_step_order, cycle_index, scheduled_at)
      VALUES (NEW.recommendation_id, 5, 1, next_at)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_recommendation_step_followup
  AFTER INSERT OR UPDATE OF completed_at ON winelio.recommendation_steps
  FOR EACH ROW EXECUTE FUNCTION winelio.handle_recommendation_step_completion();

COMMIT;
