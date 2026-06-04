# Revue juridique Winelio - points a valider

Date de travail : 2026-06-04

Document de travail non substitutif a une consultation d'avocat. Les textes ci-dessous ont ete separes et renforces a partir du document colle, de la codebase Winelio, des specs internes et des archives Obsidian.

## Documents proposes

1. Mentions legales
2. Conditions Generales d'Utilisation (CGU)
3. Conditions Professionnels / CGV de commission d'intermédiation
4. Reglement du programme d'affiliation et Winelio Rewards
5. Politique de confidentialite

## References legales utilisees

- LCEN, article 6 : identification de l'editeur et de l'hebergeur des services en ligne.
  Source : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000044067469
- Code de la consommation, article L111-7 : obligations de l'operateur de plateforme en ligne, information loyale, claire et transparente.
  Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033219601
- Code de la consommation, article D111-7 : informations sur les modalites de referencement, classement et dereferencement.
  Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035733561
- Code de la consommation, article L121-15 : interdiction des dispositifs de type vente pyramidale / boule de neige.
  Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032227258
- Code de commerce, article L441-1 : mentions et communication des CGV entre professionnels.
  Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414469
- Code de commerce, article L441-10 : delais de paiement, penalites de retard, indemnite forfaitaire de recouvrement.
  Source : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000038414392
- Code de la consommation, articles L221-18 a L221-28 : droit de retractation pour contrats a distance et hors etablissement, si applicable.
  Source : https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032226844
- RGPD, articles 6 et 13 : bases legales et information des personnes lors de la collecte.
  Sources CNIL : https://www.cnil.fr/fr/les-bases-legales et https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement
- CNIL, cookies et traceurs : information et consentement selon les finalites.
  Source : https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi

## Points coherents avec Winelio

- Winelio est bien presente comme plateforme de mise en relation et non comme executant des prestations.
- Les commissions d'intermédiation affiliees sont rattachees a des prestations reelles, facturees et payees, ce qui est indispensable pour s'eloigner du risque de vente pyramidale.
- Le wallet, les retraits, les frais de retrait inferieurs a 50 euros et les controles anti-fraude sont coherents avec la codebase.
- Les documents internes confirment un workflow de recommandation en 7 etapes, un paiement Stripe au moment de l'etape 6 et une distribution MLM sur 5 niveaux.
- Les archives Obsidian signalent deja un audit avocat MLM obligatoire avant ouverture publique et un risque particulier sur l'immobilier / loi Hoguet.

## Incoherences ou decisions a trancher

### 1. Fait generateur de la commission d'intermédiation

Le document initial dit : commission d'intermédiation exigible lorsque la prestation est declaree terminee.

La codebase actuelle indique :
- etape 5 : montant du devis ;
- etape 6 : travaux termines + paiement recu -> creation des commissions d'intermédiation ;
- Stripe webhook : creation/distribution apres paiement de la session.

Proposition retenue dans les brouillons : la commission d'intermédiation Winelio devient exigible lorsque la mission issue de la mise en relation est realisee et/ou payee par le client final, selon les etapes applicatives, et les droits a reversement affilie ne sont acquis qu'apres encaissement effectif et absence de fraude/annulation.

### 2. Total de repartition MLM

Le modele indique :
- recommandeur : 60 %
- niveaux 1 a 5 : 3 % chacun = 15 %
- bonus sponsor du professionnel : 1 %
- cashback professionnel : 1 %
- plateforme : 23 %

Total : 100 %.

Verification effectuee le 2026-06-04 dans la base Supabase : le plan actif `Plan Standard` contient bien `level_1_percentage` a `level_5_percentage` = 3 et `platform_percentage` = 23.

Attention : plusieurs documents techniques historiques et quelques libelles/commentaires contenaient encore des references a 4 % par niveau MLM et/ou 14 % plateforme. Ces references doivent etre considerees comme obsoletes si le plan standard ci-dessus est confirme comme regle officielle.

### 3. Inscription par parrainage

La regle projet dit : inscription impossible sans code parrain valide. La codebase contient aussi une logique `assign-open-registration-sponsor` / rotation fondateurs.

Decision necessaire : si la regle juridique est "parrainage obligatoire", il faut desactiver ou encadrer la rotation. Le brouillon CGU retient la version stricte : inscription par lien/code/invitation reconnu par Winelio.

### 4. Statut fiscal/social des affilies

Si un particulier recoit regulierement des commissions d'intermédiation, il devra probablement declarer ces revenus et peut devoir disposer d'un statut adapte. Les CGU doivent eviter toute promesse de revenu net ou garanti.

Proposition retenue : Winelio peut suspendre les retraits tant que les justificatifs requis ne sont pas fournis ; l'utilisateur reste seul responsable de ses declarations fiscales et sociales.

### 5. Paiements et flux financiers

Le document initial parle de transferts de fonds. Formulation sensible.

Proposition retenue : Winelio ne se presente pas comme prestataire de services de paiement ; les paiements sont operes par des prestataires tiers agrees, notamment Stripe, selon leurs propres conditions.

### 6. Immobilier / loi Hoguet

Les archives Obsidian signalent un risque eleve si Winelio remunere un apporteur d'affaires en pourcentage d'une commission d'intermédiation liee a une operation d'agent immobilier.

Proposition retenue : exclure temporairement les activites soumises a la loi Hoguet, sauf parcours specifique valide juridiquement, carte professionnelle/mandat/regime de remuneration conforme.

### 7. Droit de retractation

La commission d'intermédiation Winelio vise les professionnels, donc B2B. Mais des utilisateurs personnes physiques peuvent utiliser la plateforme et certains contrats avec Winelio pourraient etre conclus a distance.

Proposition retenue : mention de principe du droit de retractation pour les consommateurs lorsque applicable, avec renvoi a un parcours distinct si Winelio vend un service payant a un consommateur.

### 8. RGPD et email tracking

La codebase contient tracking d'ouverture/clic email. Cela doit etre mentionne dans la politique de confidentialite, avec base legale et possibilite d'opposition quand applicable.

## Questions pour validation

1. Quelle est l'entite juridique exacte de Winelio : raison sociale, forme, SIREN/SIRET, adresse, representant legal, email officiel, telephone ?
2. Le domaine legal principal est-il `winelio.app` et l'email de contact est-il `contact@winelio.app` ?
3. Le bareme pro est-il bien 10 % jusqu'a 25 000 euros puis 5 % au-dela ? Ce seuil est-il par mission, par client, par annee civile ou par professionnel ?
4. Confirmer que la repartition officielle a publier est bien : 60 % recommandeur, 3 % par niveau MLM sur 5 niveaux, 1 % affiliation, 1 % cashback Wins, 23 % plateforme.
5. Les retraits doivent-ils exiger un minimum de retrait ou seulement appliquer 0,25 euro de frais sous 50 euros ?
6. Winelio ouvre-t-il aux agents immobiliers des maintenant, ou les exclut-on tant qu'un avocat n'a pas valide le montage Hoguet ?
7. Les utilisateurs affilies doivent-ils obligatoirement etre majeurs et residents fiscaux francais/UE ?
8. Stripe est-il le seul prestataire de paiement prevu au lancement ?
