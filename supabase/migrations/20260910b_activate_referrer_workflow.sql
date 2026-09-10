BEGIN;

-- Annule les anciens messages de validation encore en attente, sans supprimer l’historique.
UPDATE winelio.email_queue SET status = 'failed', error = 'Parcours remplacé : aucun email intermédiaire au client'
WHERE status = 'pending' AND (dedupe_key LIKE 'client-action:%' OR dedupe_key LIKE 'recommendation:%:step:2:contact');

UPDATE winelio.steps SET completion_role = 'REFERRER' WHERE order_index IN (3,4,6,8);
UPDATE winelio.steps SET completion_role = 'PROFESSIONAL' WHERE order_index IN (2,5,7);
UPDATE winelio.steps SET description = 'Le professionnel reçoit la recommandation.' WHERE order_index = 1;
UPDATE winelio.steps SET description = 'Le professionnel accepte la recommandation.' WHERE order_index = 2;
UPDATE winelio.steps SET description = 'Le recommandeur confirme que le professionnel a pris contact avec le client.' WHERE order_index = 3;
UPDATE winelio.steps SET description = 'Le recommandeur confirme qu’un rendez-vous est fixé.' WHERE order_index = 4;
UPDATE winelio.steps SET description = 'Le professionnel transmet un devis au client et renseigne son montant.' WHERE order_index = 5;
UPDATE winelio.steps SET description = 'Le recommandeur confirme auprès de son contact que le devis est accepté.' WHERE order_index = 6;
UPDATE winelio.steps SET name = 'Affaire terminée', description = 'Le recommandeur confirme que la prestation est terminée et que tout s’est bien passé.' WHERE order_index = 8;

UPDATE winelio.categories SET name = CASE name
  WHEN 'Comptabilite' THEN 'Comptabilité'
  WHEN 'Demenagement' THEN 'Déménagement'
  WHEN 'Electricite' THEN 'Électricité'
  WHEN 'Evenementiel' THEN 'Événementiel'
  WHEN 'Maconnerie' THEN 'Maçonnerie'
  WHEN 'Coach Développement personnel' THEN 'Coaching en développement personnel'
  ELSE name END
WHERE name IN ('Comptabilite','Demenagement','Electricite','Evenementiel','Maconnerie','Coach Développement personnel');

-- Les anciens liens de validation client ne doivent plus changer une affaire.
REVOKE EXECUTE ON FUNCTION winelio.prepare_client_recommendation_action(uuid,text,timestamptz) FROM service_role;
REVOKE EXECUTE ON FUNCTION winelio.apply_client_recommendation_action(uuid,text,integer,text,text) FROM service_role;

COMMIT;
