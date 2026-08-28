-- Correctifs production du parcours recommandation :
-- 1. Autoriser CANCELLED (refus / abandon pro)
-- 2. Autoriser l'urgence "flexible" (valeur UI)
-- 3. Relances travaux après l'étape 6 (Devis validé), plus après l'étape 5

BEGIN;

-- 1. Statut CANCELLED
ALTER TABLE winelio.recommendations
  DROP CONSTRAINT IF EXISTS recommendations_status_check;

ALTER TABLE winelio.recommendations
  ADD CONSTRAINT recommendations_status_check CHECK (
    status = ANY (ARRAY[
      'PENDING'::text,
      'ACCEPTED'::text,
      'CONTACT_MADE'::text,
      'MEETING_SCHEDULED'::text,
      'QUOTE_SUBMITTED'::text,
      'QUOTE_VALIDATED'::text,
      'PAYMENT_RECEIVED'::text,
      'COMPLETED'::text,
      'REJECTED'::text,
      'TRANSFERRED'::text,
      'EXPIRED'::text,
      'CANCELLED'::text
    ])
  );

-- 2. Urgence flexible
ALTER TABLE winelio.recommendations
  DROP CONSTRAINT IF EXISTS recommendations_urgency_check;

ALTER TABLE winelio.recommendations
  ADD CONSTRAINT recommendations_urgency_check CHECK (
    urgency_level = ANY (ARRAY[
      'low'::text,
      'normal'::text,
      'high'::text,
      'urgent'::text,
      'flexible'::text
    ])
  );

-- 3. Relances : after_step 5 (devis) → 6 (devis validé / travaux)
--    Relâcher le CHECK avant tout UPDATE vers 6.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'winelio.recommendation_followups'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%after_step_order%'
  LOOP
    EXECUTE format('ALTER TABLE winelio.recommendation_followups DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Annuler les pending après devis si le recommandeur n'a pas encore validé
UPDATE winelio.recommendation_followups f
   SET status = 'cancelled',
       cancel_reason = 'next_step_done',
       updated_at = now()
 WHERE f.after_step_order = 5
   AND f.status = 'pending'
   AND NOT EXISTS (
     SELECT 1
       FROM winelio.recommendation_steps rs
       JOIN winelio.steps s ON s.id = rs.step_id
      WHERE rs.recommendation_id = f.recommendation_id
        AND s.order_index = 6
        AND rs.completed_at IS NOT NULL
   );

-- Pending restants (devis déjà validé) : passer à after_step 6
-- s'il n'existe pas déjà un pending 6 pour la même reco
UPDATE winelio.recommendation_followups f
   SET after_step_order = 6,
       updated_at = now()
 WHERE f.after_step_order = 5
   AND f.status = 'pending'
   AND NOT EXISTS (
     SELECT 1
       FROM winelio.recommendation_followups other
      WHERE other.recommendation_id = f.recommendation_id
        AND other.after_step_order = 6
        AND other.status = 'pending'
        AND other.id <> f.id
   );

UPDATE winelio.recommendation_followups f
   SET status = 'cancelled',
       cancel_reason = 'next_step_done',
       updated_at = now()
 WHERE f.after_step_order = 5
   AND f.status = 'pending';

-- Historique sent/cancelled/superseded : aligner after_step 5 → 6
UPDATE winelio.recommendation_followups
   SET after_step_order = 6
 WHERE after_step_order = 5;

ALTER TABLE winelio.recommendation_followups
  ADD CONSTRAINT recommendation_followups_after_step_order_check
  CHECK (after_step_order IN (2, 4, 6));

CREATE OR REPLACE FUNCTION winelio.handle_recommendation_step_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $function$
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

  UPDATE winelio.recommendation_followups
     SET status = 'cancelled', cancel_reason = 'next_step_done', updated_at = now()
   WHERE recommendation_id = NEW.recommendation_id
     AND status = 'pending'
     AND after_step_order < step_order;

  -- Après acceptation (2) et RDV (4) : relances pro.
  -- Après devis validé par le recommandeur (6) : relance travaux à expected_completion_at.
  IF step_order IN (2, 4) THEN
    delay_int := CASE WHEN step_order = 2 THEN interval '24 hours' ELSE interval '72 hours' END;
    next_at   := NEW.completed_at + delay_int;
    INSERT INTO winelio.recommendation_followups
      (recommendation_id, after_step_order, cycle_index, scheduled_at)
    VALUES (NEW.recommendation_id, step_order, 1, next_at)
    ON CONFLICT DO NOTHING;
  ELSIF step_order = 6 THEN
    SELECT expected_completion_at INTO next_at
      FROM winelio.recommendations WHERE id = NEW.recommendation_id;
    IF next_at IS NOT NULL THEN
      INSERT INTO winelio.recommendation_followups
        (recommendation_id, after_step_order, cycle_index, scheduled_at)
      VALUES (NEW.recommendation_id, 6, 1, next_at)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

COMMIT;
