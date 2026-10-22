-- Suppression du cashback professionnel ; bonus du parrain du professionnel conservé.
BEGIN;
ALTER TABLE winelio.compensation_plans
  ALTER COLUMN cashback_wins_percentage SET DEFAULT 0,
  ALTER COLUMN professional_cashback_percentage SET DEFAULT 0,
  ALTER COLUMN platform_percentage SET DEFAULT 24;
UPDATE winelio.compensation_plans
SET platform_percentage = platform_percentage + cashback_wins_percentage,
    cashback_wins_percentage = 0,
    professional_cashback_percentage = 0
WHERE cashback_wins_percentage <> 0 OR professional_cashback_percentage <> 0;

DO $migration$
DECLARE v_document uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM winelio.compensation_plans
    WHERE referrer_percentage + level_1_percentage + level_2_percentage
      + level_3_percentage + level_4_percentage + level_5_percentage
      + affiliation_percentage + platform_percentage <> 100
  ) THEN RAISE EXCEPTION 'Répartition des commissions différente de 100 %%'; END IF;

  FOR v_document IN SELECT id FROM winelio.legal_documents WHERE title='Conditions Générales d''Utilisation' LOOP
    IF EXISTS (SELECT 1 FROM winelio.pro_onboarding_events WHERE document_id=v_document) THEN
      RAISE EXCEPTION 'Document déjà accepté : nouvelle version requise';
    END IF;
    UPDATE winelio.legal_documents SET title='Conditions Générales d''Utilisation', version='2026-10-22', updated_at=now() WHERE id=v_document;
    UPDATE winelio.document_sections SET title='Programme d''affiliation', content=$content$Le programme d'affiliation Winelio repose exclusivement sur des prestations reelles, facturees et payees.

Aucune remuneration n'est due pour la simple inscription d'un utilisateur, la simple invitation d'une personne, la constitution d'une equipe ou la progression du nombre d'inscrits.

Les conditions detaillees du programme d'affiliation figurent dans le Reglement du programme d'affiliation.

Cette regle vise notamment a eviter tout mecanisme prohibe de type vente pyramidale ou "boule de neige", au sens de l'article L121-15 du Code de la consommation.

Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032227258$content$ WHERE document_id=v_document AND order_index=8;
    UPDATE winelio.document_sections SET title='Cagnotte, gains affiches et retraits', content=$content$Les montants affiches dans le wallet ou la cagnotte peuvent comprendre :

- des commissions d'intermédiation acquises ;
- des commissions d'intermédiation en attente ;
- des montants soumis a verification.

Un montant affiche ne vaut pas necessairement droit immediat, inconditionnel et definitif au paiement. Winelio peut differer, corriger, annuler ou suspendre un montant en cas d'erreur, d'annulation de l'operation, de non-paiement, de remboursement, de litige, de fraude ou de controle.

Les retraits sont soumis :

- a la disponibilite effective du solde ;
- aux controles anti-fraude ;
- aux obligations fiscales, sociales, comptables et de lutte contre le blanchiment applicables ;
- aux informations de paiement fournies par l'utilisateur ;
- aux frais de retrait prevus dans l'application.

Sauf modification affichee dans l'application :

- les retraits d'un montant egal ou superieur a 50 euros ne supportent pas de frais fixes Winelio ;
- les retraits inferieurs a 50 euros peuvent supporter des frais fixes de 0,25 euro.

Winelio peut demander des justificatifs d'identite, d'activite, de statut fiscal/social ou de paiement avant tout retrait.$content$ WHERE document_id=v_document AND order_index=9;
  END LOOP;
  FOR v_document IN SELECT id FROM winelio.legal_documents WHERE title IN ('Programme d''affiliation et Winelio Rewards', 'Programme d''affiliation') LOOP
    IF EXISTS (SELECT 1 FROM winelio.pro_onboarding_events WHERE document_id=v_document) THEN
      RAISE EXCEPTION 'Document déjà accepté : nouvelle version requise';
    END IF;
    UPDATE winelio.legal_documents SET title='Programme d''affiliation', version='2026-10-22', updated_at=now() WHERE id=v_document;
    UPDATE winelio.document_sections SET title='Repartition de travail', content=$content$Sous reserve de validation commerciale et comptable, la commission d'intermédiation Winelio peut etre repartie selon le schema suivant :

- recommandeur direct : 60 % de la commission d'intermédiation Winelio ;
- sponsor de niveau 1 : 3 % ;
- sponsor de niveau 2 : 3 % ;
- sponsor de niveau 3 : 3 % ;
- sponsor de niveau 4 : 3 % ;
- sponsor de niveau 5 : 3 % ;
- bonus sponsor du professionnel : 1 % ;
- cagnotte / plateforme Winelio : 24 %.

Cette repartition totalise 100 % de la commission d'intermédiation Winelio. Elle correspond au plan standard actif applicable au 2026-10-22.

Les pourcentages peuvent varier selon les plans de compensation, categories, operations, offres promotionnelles ou modifications du programme, sous reserve d'information des utilisateurs.$content$ WHERE document_id=v_document AND order_index=5;
    UPDATE winelio.document_sections SET title='Bonus d''affiliation professionnel', content=$content$Lorsqu'un professionnel rejoint Winelio grace a un utilisateur et genere ensuite une commission d'intermédiation Winelio, un bonus peut etre attribue au sponsor du professionnel.

Le parrain du professionnel recoit automatiquement 1 % de chaque commission d'intermédiation Winelio effectivement encaissee pour une affaire aboutie de ce professionnel, meme lorsqu'un autre membre est le recommandeur. Ce bonus est credite en euros dans son portefeuille.

Ce bonus ne constitue pas une remuneration pour simple recrutement. Il est conditionne a une operation reelle generatrice de commission d'intermédiation.$content$ WHERE document_id=v_document AND order_index=8;
    DELETE FROM winelio.document_sections WHERE document_id=v_document AND order_index=9 AND title='Winelio Rewards / Wins';
  END LOOP;
END;
$migration$;
COMMIT;
