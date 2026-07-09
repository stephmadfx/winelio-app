-- Migration pour ajouter l'étape "Devis validé / accepté" en tant qu'étape 6
-- et décaler les anciennes étapes 6 et 7 vers 7 et 8.

BEGIN;

-- 1. Décaler les index des étapes existantes 6 et 7
UPDATE winelio.steps
SET order_index = 7
WHERE id = 'ac7df125-b21d-4a5b-baa2-f3e0f03819f2'; -- Travaux terminés + Paiement reçu du client

UPDATE winelio.steps
SET order_index = 8
WHERE id = '7d68bf5c-27d4-4613-879d-6f46c4532361'; -- Affaire terminée

-- 2. Insérer la nouvelle étape "Devis validé / accepté" en index 6
INSERT INTO winelio.steps (id, name, description, order_index, completion_role, is_active, created_at)
VALUES (
  'e804f5ca-4a07-4d0f-ba7d-304dfad50800',
  'Devis validé / accepté',
  'Le recommandeur confirme que son contact a validé le devis présenté par le professionnel.',
  6,
  'REFERRER',
  true,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- 3. Associer la nouvelle étape à toutes les recommandations existantes
INSERT INTO winelio.recommendation_steps (id, recommendation_id, step_id, completed_at, created_at, data)
SELECT
  gen_random_uuid() as id,
  r.id as recommendation_id,
  'e804f5ca-4a07-4d0f-ba7d-304dfad50800'::uuid as step_id,
  CASE
    WHEN rs7.completed_at IS NOT NULL THEN rs7.completed_at
    WHEN rs8.completed_at IS NOT NULL THEN rs8.completed_at
    ELSE NULL
  END as completed_at,
  now() as created_at,
  '{}'::jsonb as data
FROM winelio.recommendations r
LEFT JOIN winelio.recommendation_steps rs7 ON rs7.recommendation_id = r.id AND rs7.step_id = 'ac7df125-b21d-4a5b-baa2-f3e0f03819f2'
LEFT JOIN winelio.recommendation_steps rs8 ON rs8.recommendation_id = r.id AND rs8.step_id = '7d68bf5c-27d4-4613-879d-6f46c4532361'
ON CONFLICT (recommendation_id, step_id) DO NOTHING;

COMMIT;
