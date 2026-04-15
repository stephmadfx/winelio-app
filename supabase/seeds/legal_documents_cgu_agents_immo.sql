-- supabase/seeds/legal_documents_cgu_agents_immo.sql
DO $$
DECLARE
  v_doc_id uuid;
BEGIN
  SELECT id INTO v_doc_id
  FROM winelio.legal_documents
  WHERE title = 'CGU Agents Immobiliers' AND version = '1.0';

  IF v_doc_id IS NOT NULL THEN
    RAISE NOTICE 'CGU Agents Immobiliers v1.0 déjà présentes, seed ignoré.';
    RETURN;
  END IF;

  INSERT INTO winelio.legal_documents (title, version, status)
  VALUES ('CGU Agents Immobiliers', '1.0', 'reviewing')
  RETURNING id INTO v_doc_id;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 1, '1', 'Objet',
$ART1$Les présentes Conditions Générales d''Utilisation (ci-après « CGU ») régissent les relations contractuelles entre la société **[RAISON SOCIALE]**, immatriculée au RCS sous le numéro **[SIREN]**, dont le siège social est situé **[ADRESSE]** (ci-après « Winelio »), et tout agent immobilier ou professionnel soumis à la loi n° 70-9 du 2 janvier 1970 dite « loi Hoguet » ayant signé électroniquement les présentes CGU lors de l''activation de son compte Professionnel sur la plateforme Winelio (ci-après « l''Agent »).

La plateforme Winelio est un service de mise en relation par recommandation entre des clients potentiels (ci-après « Clients ») et des Professionnels référencés.

Les présentes CGU sont distinctes des Conditions Générales d''Utilisation Professionnels standard. Elles s''appliquent exclusivement aux Agents tels que définis ci-dessus.$ART1$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 2, '2', 'Acceptation des CGU',
$ART2$L''activation du statut Professionnel Agent Immobilier sur la plateforme vaut acceptation pleine et entière des présentes CGU. Cette acceptation est matérialisée par la **signature électronique** des présentes dans le cadre de la procédure d''enregistrement dédiée.

La signature électronique est réalisée via l''interface sécurisée de la plateforme Winelio. Elle génère un horodatage certifié, une empreinte cryptographique (SHA-256) du document signé, ainsi qu''un enregistrement de l''adresse IP et du navigateur utilisés au moment de la signature. Ces éléments constituent la preuve d''acceptation opposable.

Les présentes CGU prévalent sur tout autre document, sauf accord écrit contraire signé par Winelio.

Winelio se réserve le droit de modifier les présentes CGU à tout moment. L''Agent sera informé de toute modification par email. En cas de modification substantielle, une nouvelle signature électronique sera requise.$ART2$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 3, '3', 'Conformité réglementaire — Loi Hoguet',
$ART3$L''Agent déclare exercer son activité en conformité avec la loi n° 70-9 du 2 janvier 1970 et ses décrets d''application (loi Hoguet), notamment :

- Être titulaire d''une carte professionnelle valide délivrée par la Chambre de Commerce et d''Industrie compétente ;
- Disposer d''une garantie financière suffisante couvrant les fonds détenus pour le compte de tiers ;
- Être titulaire d''une assurance de responsabilité civile professionnelle.

**[MENTION LOI HOGUET]**

L''Agent s''engage à informer immédiatement Winelio de tout changement affectant sa situation réglementaire (expiration ou retrait de carte, changement de statut, etc.). Winelio se réserve le droit de suspendre le compte Professionnel dans l''attente de régularisation.

Winelio n''est pas mandataire immobilier au sens de la loi Hoguet. La plateforme est un service de mise en relation par recommandation. Toute transaction immobilière éventuellement conclue à la suite d''une mise en relation reste soumise aux obligations légales de l''Agent, notamment en matière de mandat écrit et de formalités obligatoires.$ART3$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 4, '4', 'Mandat de prospection',
$ART4$En acceptant les présentes CGU, l''Agent **donne mandat exprès à Winelio** d''agir en son nom pour la recherche et la mise en relation avec des clients potentiels correspondant à son activité professionnelle déclarée.

Ce mandat est :
- **Non-exclusif** : l''Agent reste libre d''exercer son activité par tous autres canaux ;
- **À titre onéreux** : il donne lieu au versement de la commission définie à l''Article 6 ;
- **Révocable** : il prend fin à la résiliation du compte Professionnel.

Le présent mandat de prospection est distinct de tout mandat immobilier réglementé. Il ne saurait se substituer aux obligations de l''Agent en vertu de la loi Hoguet.$ART4$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 5, '5', 'Obligations de l''Agent',
$ART5$L''Agent s''engage à :

1. **Traiter chaque mise en relation avec sérieux et réactivité**, en répondant à toute recommandation dans un délai raisonnable ;
2. **Renseigner fidèlement** ses informations professionnelles (activité, numéro de carte T, zone d''intervention) et les tenir à jour ;
3. **Suivre l''avancement de chaque mission** directement via l''application Winelio, en complétant les étapes du workflow de recommandation ;
4. **Déclarer le montant réel des honoraires** perçus à l''issue d''une mission issue d''une mise en relation Winelio ;
5. **Régler la commission due** à Winelio dans les conditions définies à l''Article 6 ;
6. **Ne pas contourner la commission** dans les conditions définies à l''Article 7 ;
7. **Maintenir à jour** sa situation réglementaire conformément à l''Article 3.$ART5$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 6, '6', 'Commission',
$ART6$**6.1 Taux**

En contrepartie de chaque mise en relation ayant donné lieu à la conclusion d''une affaire, l''Agent s''engage à verser à Winelio une commission calculée sur le montant **TTC des honoraires perçus du Client**.

Le taux de commission est fixé à **10 % maximum TTC**, selon le barème en vigueur publié sur la plateforme. Des réductions de taux peuvent s''appliquer en fonction du montant des honoraires, conformément audit barème.

**6.2 Fait générateur**

La commission est due dès lors que :
- un Client mis en relation via la plateforme Winelio a conclu un mandat ou passé une commande auprès de l''Agent ;
- l''Agent a validé l''étape « Devis accepté » dans son workflow de recommandation.

**6.3 Modalités de règlement**

La commission est prélevée ou facturée selon les modalités définies dans la plateforme. L''Agent s''engage à s''acquitter de la commission dans un délai de **15 jours** à compter de la validation de la mission.$ART6$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 7, '7', 'Interdiction de contournement',
$ART7$Il est **formellement interdit** à l''Agent de solliciter ou de traiter directement avec un Client mis en relation via la plateforme Winelio dans le but de contourner le paiement de la commission, notamment :

- en proposant au Client de traiter hors plateforme après une première mise en relation ;
- en ne déclarant pas une mission réalisée suite à une recommandation Winelio ;
- en sous-déclarant le montant réel des honoraires.

**Sanctions**

Tout manquement avéré à cette obligation autorise Winelio à :

1. **Réclamer immédiatement la commission due, majorée de 50 %** à titre de pénalité forfaitaire ;
2. **Suspendre ou résilier le compte** de l''Agent sans préavis ni indemnité ;
3. **Engager toute procédure nécessaire** au recouvrement des sommes dues, y compris judiciaire, les frais de recouvrement restant à la charge de l''Agent.

Ces sanctions sont cumulatives et sans préjudice de tout autre recours.$ART7$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 8, '8', 'Obligations de Winelio',
$ART8$Winelio s''engage à :

1. Mettre à disposition une plateforme fonctionnelle permettant la réception et le suivi des recommandations ;
2. Notifier l''Agent de toute nouvelle mise en relation ;
3. Assurer la confidentialité des données de l''Agent conformément à l''Article 10 ;
4. Informer l''Agent de toute modification tarifaire au moins **30 jours à l''avance**.$ART8$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 9, '9', 'Durée et résiliation',
$ART9$**9.1 Durée**

Les présentes CGU entrent en vigueur à la date de signature électronique et sont conclues pour une **durée indéterminée**.

**9.2 Résiliation à l''initiative de l''Agent**

L''Agent peut résilier son compte Professionnel à tout moment depuis les paramètres de l''application, sous réserve de s''acquitter de l''ensemble des commissions dues au titre des missions en cours ou terminées.

**9.3 Résiliation à l''initiative de Winelio**

Winelio peut suspendre ou résilier le compte Professionnel :
- **Sans préavis**, en cas de manquement grave (notamment violation des Articles 3, 5 ou 7) ou de perte de la carte professionnelle ;
- **Avec un préavis de 30 jours**, pour tout autre motif légitime.

**9.4 Effets de la résiliation**

La résiliation met fin au mandat défini à l''Article 4. Les commissions dues au titre des missions initiées avant la date de résiliation restent exigibles.$ART9$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 10, '10', 'Données personnelles (RGPD)',
$ART10$Winelio collecte et traite les données personnelles de l''Agent dans le cadre de l''exécution du contrat et du respect de ses obligations légales, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.

La signature électronique des présentes génère des données de traçabilité (adresse IP, horodatage, empreinte cryptographique) conservées à des fins probatoires conformément aux exigences légales applicables.

L''Agent dispose d''un droit d''accès, de rectification, d''effacement, de portabilité et d''opposition sur ses données, exerceable à l''adresse : **[EMAIL RGPD]**.

Pour plus d''informations, se référer à la Politique de Confidentialité disponible sur la plateforme.$ART10$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 11, '11', 'Responsabilité',
$ART11$Winelio est un intermédiaire de mise en relation. Elle ne peut être tenue responsable :
- de la qualité des prestations réalisées par l''Agent ;
- d''un différend entre l''Agent et un Client ;
- de l''absence de mise en relation en cas de faible activité sur la plateforme ;
- du non-respect par l''Agent de ses obligations légales au titre de la loi Hoguet.

La responsabilité de Winelio est en tout état de cause limitée au montant des commissions effectivement perçues au titre des trois (3) derniers mois précédant le fait générateur du litige.$ART11$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 12, '12', 'Droit applicable et juridiction',
$ART12$Les présentes CGU sont soumises au **droit français**.

En cas de litige, les parties s''engagent à rechercher une solution amiable préalablement à tout recours judiciaire. À défaut d''accord dans un délai de 30 jours, le litige sera porté devant le **[TRIBUNAL COMPÉTENT]**.$ART12$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 13, '13', 'Dispositions diverses',
$ART13$- **Intégralité** : les présentes CGU constituent l''intégralité de l''accord entre les parties sur leur objet ;
- **Divisibilité** : si une clause est déclarée nulle, les autres clauses restent en vigueur ;
- **Non-renonciation** : le fait pour Winelio de ne pas se prévaloir d''un manquement ne vaut pas renonciation à s''en prévaloir ultérieurement ;
- **Primauté** : les présentes CGU prennent le pas sur les CGU Professionnels standard pour tout professionnel relevant de la loi Hoguet.

*En signant électroniquement les présentes lors de l''activation de son compte Professionnel Agent Immobilier, l''Agent reconnaît avoir lu, compris et accepté sans réserve les présentes Conditions Générales d''Utilisation.*$ART13$);

  RAISE NOTICE 'CGU Agents Immobiliers v1.0 insérées avec succès (id: %).', v_doc_id;
END $$;
