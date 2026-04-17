-- Fix : step 6 (Devis validé) doit être validé par le REFERRER (celui qui a
-- recommandé), pas par le professionnel. C'est une règle métier fondamentale :
-- le client/referrer valide le devis présenté par le pro → déclenche les
-- commissions MLM.
--
-- Au recettage du 2026-04-17, toutes les étapes avaient completion_role =
-- PROFESSIONAL, ce qui empêchait le referrer de valider le devis via l'UI.

UPDATE winelio.steps
SET completion_role = 'REFERRER'
WHERE order_index = 6;
