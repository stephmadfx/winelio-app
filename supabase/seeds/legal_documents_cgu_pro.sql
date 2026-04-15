-- supabase/seeds/legal_documents_cgu_pro.sql
DO $$
DECLARE
  v_doc_id uuid;
BEGIN
  SELECT id INTO v_doc_id
  FROM winelio.legal_documents
  WHERE title = 'CGU Professionnels' AND version = '1.0';

  IF v_doc_id IS NOT NULL THEN
    RAISE NOTICE 'CGU Professionnels v1.0 déjà présentes, seed ignoré.';
    RETURN;
  END IF;

  INSERT INTO winelio.legal_documents (title, version, status)
  VALUES ('CGU Professionnels', '1.0', 'reviewing')
  RETURNING id INTO v_doc_id;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 1, '1', 'Objet',
$ART1$Les présentes Conditions Générales d''Utilisation (ci-après « CGU ») régissent les relations contractuelles entre la société **[RAISON SOCIALE]**, immatriculée au RCS sous le numéro **[SIREN]**, dont le siège social est situé **[ADRESSE]** (ci-après « Winelio »), et toute personne physique ou morale exerçant une activité professionnelle ayant accepté les présentes CGU lors de l''activation de son compte Professionnel sur la plateforme Winelio (ci-après « le Professionnel »).

La plateforme Winelio est un service de mise en relation par recommandation entre des clients potentiels (ci-après « Clients ») et des Professionnels référencés.$ART1$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 2, '2', 'Acceptation des CGU',
$ART2$L''activation du statut Professionnel sur la plateforme vaut acceptation pleine et entière des présentes CGU. Cette acceptation est matérialisée par le cochage de la case prévue à cet effet lors de la procédure d''enregistrement.

Les présentes CGU prévalent sur tout autre document, sauf accord écrit contraire signé par Winelio.

Winelio se réserve le droit de modifier les présentes CGU à tout moment. Le Professionnel sera informé de toute modification par email. La poursuite de l''utilisation de la plateforme après notification vaudra acceptation des nouvelles CGU.$ART2$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 3, '3', 'Mandat de prospection',
$ART3$En acceptant les présentes CGU, le Professionnel **donne mandat exprès à Winelio** d''agir en son nom pour la recherche et la mise en relation avec des clients potentiels correspondant à son activité professionnelle déclarée.

Ce mandat est :
- **Non-exclusif** : le Professionnel reste libre d''exercer son activité par tous autres canaux ;
- **À titre onéreux** : il donne lieu au versement de la commission définie à l''Article 5 ;
- **Révocable** : il prend fin à la résiliation du compte Professionnel.$ART3$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 4, '4', 'Obligations du Professionnel',
$ART4$Le Professionnel s''engage à :

1. **Traiter chaque mise en relation avec sérieux et réactivité**, en répondant à toute recommandation dans un délai raisonnable ;
2. **Renseigner fidèlement** ses informations professionnelles (activité, SIRET le cas échéant, zone d''intervention) et les tenir à jour ;
3. **Suivre l''avancement de chaque mission** directement via l''application Winelio, en complétant les étapes du workflow de recommandation ;
4. **Déclarer le montant réel de la facture** émise à l''issue d''une mission issue d''une mise en relation Winelio ;
5. **Régler la commission due** à Winelio dans les conditions définies à l''Article 5 ;
6. **Ne pas contourner la commission** dans les conditions définies à l''Article 6.$ART4$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 5, '5', 'Commission',
$ART5$**5.1 Taux**

En contrepartie de chaque mise en relation ayant donné lieu à la conclusion d''une affaire, le Professionnel s''engage à verser à Winelio une commission calculée sur le montant **TTC de la facture émise au Client**.

Le taux de commission est fixé à **10 % maximum TTC**, selon le barème en vigueur publié sur la plateforme. Des réductions de taux peuvent s''appliquer en fonction du montant de la facture, conformément audit barème.

**5.2 Fait générateur**

La commission est due dès lors que :
- un Client mis en relation via la plateforme Winelio a conclu un contrat ou passé une commande auprès du Professionnel ;
- le Professionnel a validé l''étape « Devis accepté » dans son workflow de recommandation.

**5.3 Modalités de règlement**

La commission est prélevée ou facturée selon les modalités définies dans la plateforme. Le Professionnel s''engage à s''acquitter de la commission dans un délai de **15 jours** à compter de la validation de la mission.$ART5$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 6, '6', 'Interdiction de contournement',
$ART6$Il est **formellement interdit** au Professionnel de solliciter ou de traiter directement avec un Client mis en relation via la plateforme Winelio dans le but de contourner le paiement de la commission, notamment :

- en proposant au Client de traiter hors plateforme après une première mise en relation ;
- en ne déclarant pas une mission réalisée suite à une recommandation Winelio ;
- en sous-déclarant le montant réel de la facture.

**Sanctions**

Tout manquement avéré à cette obligation autorise Winelio à :

1. **Réclamer immédiatement la commission due, majorée de 50 %** à titre de pénalité forfaitaire ;
2. **Suspendre ou résilier le compte** du Professionnel sans préavis ni indemnité ;
3. **Engager toute procédure nécessaire** au recouvrement des sommes dues, y compris judiciaire, les frais de recouvrement restant à la charge du Professionnel.

Ces sanctions sont cumulatives et sans préjudice de tout autre recours.$ART6$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 7, '7', 'Obligations de Winelio',
$ART7$Winelio s''engage à :

1. Mettre à disposition une plateforme fonctionnelle permettant la réception et le suivi des recommandations ;
2. Notifier le Professionnel de toute nouvelle mise en relation ;
3. Assurer la confidentialité des données du Professionnel conformément à l''Article 9 ;
4. Informer le Professionnel de toute modification tarifaire au moins **30 jours à l''avance**.$ART7$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 8, '8', 'Durée et résiliation',
$ART8$**8.1 Durée**

Les présentes CGU entrent en vigueur à la date d''activation du statut Professionnel et sont conclues pour une **durée indéterminée**.

**8.2 Résiliation à l''initiative du Professionnel**

Le Professionnel peut résilier son compte Professionnel à tout moment depuis les paramètres de l''application, sous réserve de s''acquitter de l''ensemble des commissions dues au titre des missions en cours ou terminées.

**8.3 Résiliation à l''initiative de Winelio**

Winelio peut suspendre ou résilier le compte Professionnel :
- **Sans préavis**, en cas de manquement grave (notamment violation de l''Article 6) ;
- **Avec un préavis de 30 jours**, pour tout autre motif légitime.

**8.4 Effets de la résiliation**

La résiliation met fin au mandat défini à l''Article 3. Les commissions dues au titre des missions initiées avant la date de résiliation restent exigibles.$ART8$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 9, '9', 'Données personnelles (RGPD)',
$ART9$Winelio collecte et traite les données personnelles du Professionnel dans le cadre de l''exécution du contrat et du respect de ses obligations légales, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.

Le Professionnel dispose d''un droit d''accès, de rectification, d''effacement, de portabilité et d''opposition sur ses données, exerceable à l''adresse : **[EMAIL RGPD]**.

Pour plus d''informations, se référer à la Politique de Confidentialité disponible sur la plateforme.$ART9$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 10, '10', 'Responsabilité',
$ART10$Winelio est un intermédiaire de mise en relation. Elle ne peut être tenue responsable :
- de la qualité des prestations réalisées par le Professionnel ;
- d''un différend entre le Professionnel et un Client ;
- de l''absence de mise en relation en cas de faible activité sur la plateforme.

La responsabilité de Winelio est en tout état de cause limitée au montant des commissions effectivement perçues au titre des trois (3) derniers mois précédant le fait générateur du litige.$ART10$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 11, '11', 'Cas particuliers — Agents immobiliers',
$ART11$Les agents immobiliers et tout professionnel soumis à la loi Hoguet sont **exclus du champ des présentes CGU**. Ils sont soumis à des Conditions Générales spécifiques distinctes, conclues par voie de **signature électronique**. Les modalités seront précisées lors de l''ouverture de ce parcours dédié.$ART11$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 12, '12', 'Droit applicable et juridiction',
$ART12$Les présentes CGU sont soumises au **droit français**.

En cas de litige, les parties s''engagent à rechercher une solution amiable préalablement à tout recours judiciaire. À défaut d''accord dans un délai de 30 jours, le litige sera porté devant le **[TRIBUNAL COMPÉTENT]**.$ART12$);

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_doc_id, 13, '13', 'Dispositions diverses',
$ART13$- **Intégralité** : les présentes CGU constituent l''intégralité de l''accord entre les parties sur leur objet ;
- **Divisibilité** : si une clause est déclarée nulle, les autres clauses restent en vigueur ;
- **Non-renonciation** : le fait pour Winelio de ne pas se prévaloir d''un manquement ne vaut pas renonciation à s''en prévaloir ultérieurement.

*En cochant la case prévue à cet effet lors de l''activation de son compte Professionnel, le Professionnel reconnaît avoir lu, compris et accepté sans réserve les présentes Conditions Générales d''Utilisation.*$ART13$);

  RAISE NOTICE 'CGU Professionnels v1.0 insérées avec succès (id: %).', v_doc_id;
END $$;
