-- 1. Étape 6 : "Travaux terminés + Paiement reçu du client" (PROFESSIONAL)
UPDATE winelio.steps
SET name        = 'Travaux terminés + Paiement reçu du client',
    description = 'Le professionnel confirme que les travaux sont terminés et que le paiement du client a été reçu.',
    completion_role = 'PROFESSIONAL'
WHERE id = 'ac7df125-b21d-4a5b-baa2-f3e0f03819f2';

-- 2. Supprimer les recommendation_steps de l'ancienne étape 7 "Paiement reçu"
DELETE FROM winelio.recommendation_steps
WHERE step_id = 'cd02742d-b1fd-4f98-94e2-7f92e9e3ea1c';

-- 3. Supprimer l'ancienne étape 7
DELETE FROM winelio.steps
WHERE id = 'cd02742d-b1fd-4f98-94e2-7f92e9e3ea1c';

-- 4. Ancienne étape 8 "Affaire terminée" → order_index 7
UPDATE winelio.steps
SET order_index = 7
WHERE id = '7d68bf5c-27d4-4613-879d-6f46c4532361';
