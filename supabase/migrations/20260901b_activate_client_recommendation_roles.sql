-- À appliquer après le déploiement du code qui sait traiter le rôle CONTACT.

BEGIN;

UPDATE winelio.steps
SET completion_role = 'CONTACT',
    description = 'Le client final confirme directement que le devis du professionnel est accepté.'
WHERE order_index = 6;

UPDATE winelio.steps
SET name = 'Prestation confirmée par le client',
    completion_role = 'CONTACT',
    description = 'Le client final confirme que la prestation est terminée et conforme.'
WHERE order_index = 8;

COMMIT;
