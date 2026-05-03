-- ============================================================
-- Fix 1 : trigger handle_recommendation_step_completion silencieux
-- ============================================================
-- La fonction n'a pas SECURITY DEFINER et la table
-- winelio.recommendation_followups est sous RLS sans policy INSERT.
-- → l'INSERT déclenché par le trigger échoue silencieusement (0 rows
--   affected, aucune erreur remontée), donc aucune relance pro
--   automatique n'a jamais été créée depuis l'introduction de la table.

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

  -- Cancel TOUS les followups pending dont l'étape suivante est déjà complétée
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
END
$function$;

-- ============================================================
-- Fix 2 : trigger init_recommendation_steps crée des doublons
-- ============================================================
-- Ce trigger AFTER INSERT ON winelio.recommendations insère 7 steps,
-- puis le code applicatif src/app/api/recommendations/create/route.ts
-- en insère 7 autres → on se retrouve avec 14 lignes par reco
-- (étapes complétées en double, requêtes admin biaisées, etc.).
-- En plus la fonction ne préfixe pas le schéma 'winelio', donc en
-- contexte sans search_path adapté elle plante carrément.
--
-- Solution : on supprime le trigger + la fonction. La création des
-- steps reste à la charge du code applicatif (route create + claim
-- finalize), source unique de vérité.

DROP TRIGGER IF EXISTS on_recommendation_created ON winelio.recommendations;
DROP FUNCTION IF EXISTS winelio.init_recommendation_steps();

-- ============================================================
-- Fix 3 : nettoyage des doublons existants
-- ============================================================
-- Pour chaque (recommendation_id, step_id) on garde la ligne la plus
-- "avancée" : celle qui a un completed_at non-null en priorité, sinon
-- la plus ancienne. Les autres lignes en double sont supprimées.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY recommendation_id, step_id
           ORDER BY (completed_at IS NULL), created_at
         ) AS rn
    FROM winelio.recommendation_steps
)
DELETE FROM winelio.recommendation_steps rs
 USING ranked
 WHERE rs.id = ranked.id
   AND ranked.rn > 1;

-- ============================================================
-- Fix 4 : contrainte UNIQUE pour empêcher le retour des doublons
-- ============================================================
ALTER TABLE winelio.recommendation_steps
  ADD CONSTRAINT recommendation_steps_unique_step
  UNIQUE (recommendation_id, step_id);
