-- Synchronise les documents juridiques RGPD Winelio dans le schema applicatif uniquement.
-- Migration idempotente : conserve les anciens documents/versions et remplace seulement
-- les sections de la version de travail 2026-06-04 si elle existe deja.

BEGIN;

DO $$
DECLARE
  v_document_id uuid;
BEGIN

  SELECT id INTO v_document_id
  FROM winelio.legal_documents
  WHERE title = 'Mentions légales'
    AND version = '2026-06-04'
  LIMIT 1;

  IF v_document_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Mentions légales', '2026-06-04', 'draft')
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE winelio.legal_documents
    SET status = 'draft', updated_at = now()
    WHERE id = v_document_id;

    DELETE FROM winelio.document_sections
    WHERE document_id = v_document_id;
  END IF;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 1, '1', 'Editeur du service', $DOC1S1$Le service Winelio, accessible notamment a l'adresse :

`https://winelio.app`

est edite par :

- Denomination sociale : en attente de validation
- Forme juridique : en attente de validation
- Capital social : en attente de validation
- Siege social : en attente de validation
- SIREN / SIRET : en attente de validation
- RCS : en attente de validation
- Numero TVA intracommunautaire : en attente de validation, si applicable
- Directeur de la publication : en attente de validation
- Email : contact@winelio.app
- Telephone : en attente de validation

Ci-apres "Winelio".$DOC1S1$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 2, '2', 'Hebergement', $DOC1S2$Le service est heberge par :

- Hebergeur applicatif / infrastructure : en attente de validation
- Adresse : en attente de validation
- Telephone : en attente de validation
- Site web : en attente de validation

La base de donnees et certains services techniques peuvent etre operes sur une infrastructure Supabase auto-hebergee par Winelio ou pour son compte.$DOC1S2$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 3, '3', 'Activite du service', $DOC1S3$Winelio est une plateforme numerique de mise en relation professionnelle par recommandation. Elle permet notamment :

- a des utilisateurs de recommander des professionnels ;
- a des professionnels de recevoir et suivre des opportunites commerciales ;
- a Winelio de percevoir une commission d'intermédiation lorsque les conditions contractuelles sont reunies ;
- a certains utilisateurs eligibles de recevoir des reversements lies a des prestations reelles, facturees et payees.

Winelio n'execute pas les prestations proposees par les professionnels references et n'est pas partie au contrat conclu entre le client final et le professionnel.$DOC1S3$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 4, '4', 'Propriete intellectuelle', $DOC1S4$L'ensemble des elements composant le service Winelio, notamment les textes, interfaces, bases de donnees, logiciels, marques, logos, graphismes, contenus, structures et developpements techniques, est protege par le droit de la propriete intellectuelle.

Toute reproduction, representation, adaptation, extraction, diffusion ou exploitation non autorisee, totale ou partielle, est interdite.

Le nom "Winelio", ses logos et signes distinctifs sont proteges ou en cours de protection. Aucun droit d'utilisation n'est accorde sans autorisation ecrite prealable.$DOC1S4$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 5, '5', 'Signalement et contact', $DOC1S5$Pour toute question relative au service, aux contenus, a une mise en relation ou a un signalement, Winelio peut etre contacte a l'adresse :

contact@winelio.app

Pour les demandes relatives aux donnees personnelles :

Contact RGPD en attente de validation. Dans l'intervalle, les demandes peuvent etre adressees a contact@winelio.app.$DOC1S5$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 6, '6', 'References legales', $DOC1S6$Ces mentions legales sont etablies notamment au regard de l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'economie numerique.

Source : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000044067469$DOC1S6$);

  SELECT id INTO v_document_id
  FROM winelio.legal_documents
  WHERE title = 'Conditions Générales d''Utilisation'
    AND version = '2026-06-04'
  LIMIT 1;

  IF v_document_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Conditions Générales d''Utilisation', '2026-06-04', 'draft')
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE winelio.legal_documents
    SET status = 'draft', updated_at = now()
    WHERE id = v_document_id;

    DELETE FROM winelio.document_sections
    WHERE document_id = v_document_id;
  END IF;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 1, '1', 'Objet', $DOC2S1$Les presentes Conditions Generales d'Utilisation (ci-apres les "CGU") definissent les conditions d'acces et d'utilisation de la plateforme Winelio.

Winelio est une plateforme de mise en relation professionnelle par recommandation permettant notamment :

- la creation d'un compte utilisateur ;
- la recommandation de professionnels a des contacts ou clients potentiels ;
- le suivi d'opportunites commerciales ;
- l'acces a un reseau de parrainage limite a cinq niveaux ;
- l'affichage d'une cagnotte et, sous conditions, la demande de reversement de commissions d'intermédiation.

Winelio agit comme operateur de plateforme et intermediaire de mise en relation. Winelio ne fournit pas elle-meme les prestations proposees par les professionnels et n'est pas partie au contrat conclu entre un client final et un professionnel.$DOC2S1$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 2, '2', 'Definitions', $DOC2S2$"Utilisateur" designe toute personne disposant d'un compte Winelio.

"Affilie" designe un utilisateur pouvant recommander des professionnels ou contacts, participer au programme d'affiliation et, lorsque les conditions sont reunies, percevoir des commissions d'intermédiation.

"Professionnel" designe tout utilisateur ayant active un compte professionnel afin de recevoir et gerer des recommandations via Winelio.

"Client final" ou "Contact" designe la personne mise en relation avec un professionnel a la suite d'une recommandation.

"Recommandation" designe une opportunite transmise via la plateforme a un professionnel.

"Commission d'intermédiation Winelio" designe la commission d'intermédiation due par le professionnel a Winelio dans les conditions prevues aux Conditions Professionnels / CGV.

"Reversement affilie" designe la part de commission d'intermédiation pouvant etre creditee a un utilisateur eligible, sous reserve des conditions du programme d'affiliation.$DOC2S2$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 3, '3', 'Acceptation des CGU', $DOC2S3$L'utilisation de Winelio implique l'acceptation pleine et entiere des presentes CGU.

L'acceptation peut etre materialisee par une case a cocher, la creation d'un compte, la poursuite de l'utilisation du service ou tout autre mecanisme d'acceptation prevu dans l'application.

Winelio peut modifier les CGU. En cas de modification substantielle, les utilisateurs seront informes par tout moyen approprie. Lorsque la modification affecte substantiellement les droits ou obligations de l'utilisateur, Winelio pourra demander une nouvelle acceptation.$DOC2S3$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 4, '4', 'Conditions d''inscription', $DOC2S4$L'utilisation de Winelio est reservee aux personnes physiques majeures et capables, ainsi qu'aux personnes morales representees par une personne habilitee.

L'inscription a Winelio repose sur un systeme de parrainage. Sauf invitation specifique reconnue par Winelio, l'utilisateur doit utiliser un code parrain ou un lien d'invitation valide.

L'utilisateur s'engage a fournir des informations exactes, completes et a jour. Winelio peut suspendre un compte si les informations fournies sont inexactes, incompletes, frauduleuses ou non verifiables.

Un utilisateur ne peut detenir qu'un seul compte personnel, sauf autorisation expresse de Winelio.$DOC2S4$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 5, '5', 'Compte et securite', $DOC2S5$L'utilisateur est responsable de l'utilisation de son compte et de la confidentialite de ses moyens d'authentification.

Toute utilisation du compte est presumee effectuee par l'utilisateur, sauf preuve contraire.

L'utilisateur doit informer Winelio sans delai en cas d'acces non autorise, suspicion de fraude ou compromission de son compte.$DOC2S5$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 6, '6', 'Role de Winelio comme plateforme', $DOC2S6$Winelio fournit un service technique et commercial de mise en relation. A ce titre, Winelio peut :

- referencer des professionnels ;
- transmettre des recommandations ;
- organiser un workflow de suivi ;
- collecter certaines informations necessaires au calcul des commissions d'intermédiation ;
- notifier les parties ;
- mettre a disposition des outils de paiement operes par des prestataires tiers.

Conformement a l'article L111-7 du Code de la consommation, lorsque Winelio agit comme operateur de plateforme en ligne, elle s'efforce de fournir une information loyale, claire et transparente sur les modalites de mise en relation, de classement et de referencement.

Sources :
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033219601
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035733561$DOC2S6$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 7, '7', 'Recommandations', $DOC2S7$L'utilisateur peut recommander un professionnel ou transmettre une opportunite commerciale selon les fonctionnalites disponibles dans l'application.

L'utilisateur garantit que les informations transmises dans une recommandation sont exactes, loyales, pertinentes, necessaires et obtenues licitement.

Lorsqu'une recommandation contient des donnees personnelles d'un tiers, notamment les coordonnees d'un client final ou d'un contact recommande, l'utilisateur s'engage a :

- disposer d'une base legitime pour transmettre ces donnees a Winelio ;
- informer la personne concernee de la transmission, de la finalite de mise en relation, des destinataires possibles et de ses droits, lorsque cette information est requise ;
- obtenir le consentement de la personne concernee lorsque la loi l'exige, notamment pour certaines communications de prospection ;
- ne transmettre aucune donnee sensible, excessive, trompeuse ou manifestement inutile ;
- respecter toute demande d'opposition, de retrait ou de suppression formulee par la personne concernee.

Winelio peut refuser, supprimer, suspendre ou controler une recommandation en cas de suspicion de fraude, d'abus, d'information inexacte, de doublon, d'auto-contournement ou d'usage contraire aux presentes CGU.$DOC2S7$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 8, '8', 'Programme d''affiliation', $DOC2S8$Le programme d'affiliation Winelio repose exclusivement sur des prestations reelles, facturees et payees.

Aucune remuneration n'est due pour la simple inscription d'un utilisateur, la simple invitation d'une personne, la constitution d'une equipe ou la progression du nombre d'inscrits.

Les conditions detaillees du programme d'affiliation figurent dans le Reglement du programme d'affiliation et Winelio Rewards.

Cette regle vise notamment a eviter tout mecanisme prohibe de type vente pyramidale ou "boule de neige", au sens de l'article L121-15 du Code de la consommation.

Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032227258$DOC2S8$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 9, '9', 'Cagnotte, gains affiches et retraits', $DOC2S9$Les montants affiches dans le wallet ou la cagnotte peuvent comprendre :

- des commissions d'intermédiation acquises ;
- des commissions d'intermédiation en attente ;
- des montants soumis a verification ;
- des avantages internes en Wins.

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

Winelio peut demander des justificatifs d'identite, d'activite, de statut fiscal/social ou de paiement avant tout retrait.$DOC2S9$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 10, '10', 'Obligations fiscales et sociales des utilisateurs', $DOC2S10$Les utilisateurs sont seuls responsables de leurs obligations fiscales, sociales, comptables et declaratives relatives aux sommes ou avantages qu'ils percoivent via Winelio.

Winelio ne fournit pas de conseil fiscal, social ou comptable personnalise.

Winelio peut suspendre les reversements si elle estime que l'utilisateur ne dispose pas des justificatifs ou du statut necessaires a la perception reguliere de commissions d'intermédiation.$DOC2S10$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 11, '11', 'Comportements interdits', $DOC2S11$Il est interdit de :

- fournir des informations fausses, inexactes ou trompeuses ;
- creer plusieurs comptes sans autorisation ;
- usurper l'identite d'un tiers ;
- utiliser la plateforme pour des prestations illicites ;
- manipuler le systeme de recommandation ou le reseau de parrainage ;
- generer de fausses recommandations ;
- contourner la plateforme apres une mise en relation ;
- tenter d'obtenir une commission d'intermédiation sans prestation reelle ;
- utiliser des scripts, robots ou automatisations non autorises ;
- porter atteinte a la securite, a l'integrite ou au fonctionnement de Winelio.$DOC2S11$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 12, '12', 'Anti-contournement', $DOC2S12$Lorsqu'une mise en relation a ete initiee par Winelio, les utilisateurs s'engagent a ne pas organiser volontairement l'operation hors plateforme dans le but d'eviter la commission d'intermédiation ou le suivi contractuel.

En cas de contournement, Winelio peut notamment :

- suspendre ou resilier les comptes concernes ;
- annuler les commissions d'intermédiation ou avantages ;
- reclamer les sommes dues ;
- demander reparation du prejudice subi.$DOC2S12$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 13, '13', 'Suspension et resiliation', $DOC2S13$Winelio peut suspendre ou fermer un compte, avec ou sans preavis selon la gravite, en cas de :

- violation des CGU ;
- fraude ou suspicion serieuse de fraude ;
- usage abusif ;
- risque juridique, financier ou securitaire ;
- demande d'une autorite ;
- inactivite prolongee ;
- impossibilite de verifier les informations du compte.

L'utilisateur peut demander la fermeture de son compte, sous reserve du traitement des operations en cours et des obligations de conservation applicables.$DOC2S13$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 14, '14', 'Responsabilite', $DOC2S14$Winelio ne garantit pas :

- l'obtention de recommandations ;
- la conclusion d'une affaire ;
- le paiement par un client final ;
- la qualite ou la bonne execution d'une prestation par un professionnel ;
- un niveau de gain, revenu ou avantage.

Winelio n'intervient pas dans l'execution des prestations et n'est pas responsable des litiges entre clients finaux, utilisateurs et professionnels, sauf faute directement imputable a Winelio.

Dans les limites permises par la loi, la responsabilite de Winelio est limitee aux dommages directs et previsibles, a l'exclusion des dommages indirects, pertes d'exploitation, pertes de chance, pertes de donnees ou atteintes a l'image.$DOC2S14$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 15, '15', 'Donnees personnelles', $DOC2S15$Les traitements de donnees personnelles sont decrits dans la Politique de confidentialite de Winelio.

Chaque utilisateur reste responsable de la liceite des donnees personnelles qu'il transmet a Winelio au sujet de tiers. Winelio peut demander des informations complementaires, limiter une recommandation ou supprimer des donnees si leur traitement apparait illicite, excessif, conteste ou non necessaire.$DOC2S15$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 16, '16', 'Deces d''un utilisateur', $DOC2S16$En cas de deces d'un utilisateur, Winelio peut suspendre puis cloturer le compte sur presentation de justificatifs suffisants, notamment acte de deces et justificatifs de qualite d'ayant droit.

Les sommes disponibles et definitivement acquises a la date du deces peuvent etre reversees aux ayants droit legalement reconnus, apres verification des pieces necessaires.

Les commissions d'intermédiation, bonus, avantages ou reversements generes posterieurement au deces cessent automatiquement, sauf obligation legale contraire ou decision expresse de Winelio.$DOC2S16$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 17, '17', 'Droit applicable et litiges', $DOC2S17$Les presentes CGU sont soumises au droit francais.

Les parties s'efforcent de resoudre amiablement tout differend. A defaut, le litige sera porte devant les juridictions competentes selon les regles de procedure applicables.

Lorsque l'utilisateur agit en qualite de consommateur, les regles protectrices imperatives applicables aux consommateurs demeurent reservees.$DOC2S17$);

  SELECT id INTO v_document_id
  FROM winelio.legal_documents
  WHERE title = 'Conditions Professionnels / CGV'
    AND version = '2026-06-04'
  LIMIT 1;

  IF v_document_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Conditions Professionnels / CGV', '2026-06-04', 'draft')
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE winelio.legal_documents
    SET status = 'draft', updated_at = now()
    WHERE id = v_document_id;

    DELETE FROM winelio.document_sections
    WHERE document_id = v_document_id;
  END IF;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 1, '1', 'Objet', $DOC3S1$Les presentes Conditions Professionnels / Conditions Generales de Vente (ci-apres les "Conditions Professionnels") definissent les conditions dans lesquelles Winelio fournit a des professionnels un service de mise en relation commerciale par recommandation.

Elles s'appliquent a tout professionnel qui active un compte professionnel, reference une entreprise, accepte une recommandation, accede aux coordonnees d'un contact ou utilise les fonctionnalites professionnelles de Winelio.

Elles completent les CGU. En cas de contradiction, les presentes Conditions Professionnels prevalent pour les relations entre Winelio et le Professionnel.

Les CGV entre professionnels doivent notamment comporter les conditions de reglement et les elements de determination du prix lorsqu'elles sont etablies, conformement a l'article L441-1 du Code de commerce.

Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414469$DOC3S1$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 2, '2', 'Identification du Professionnel', $DOC3S2$Le Professionnel s'engage a fournir des informations exactes et a jour, notamment :

- nom commercial et/ou denomination sociale ;
- SIRET/SIREN lorsque applicable ;
- activite exercee ;
- adresse professionnelle ;
- zone d'intervention ;
- assurances obligatoires ou recommandees selon l'activite ;
- autorisations, qualifications, cartes professionnelles ou garanties requises.

Winelio peut verifier ces informations, notamment via des bases publiques, des justificatifs ou des controles manuels.

Winelio peut refuser, suspendre ou dereferencer un professionnel si les informations fournies sont inexactes, incompletes, non verifiables ou incompatibles avec les obligations legales applicables.$DOC3S2$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 3, '3', 'Exclusion ou parcours specifique des professions reglementees', $DOC3S3$Certaines activites reglementees peuvent necessiter des conditions specifiques.

Les activites soumises a la loi n° 70-9 du 2 janvier 1970, dite loi Hoguet, notamment certaines operations immobilieres, sont exclues du parcours standard tant qu'un cadre juridique specifique n'a pas ete valide par Winelio.

Si Winelio ouvre un parcours dedie aux agents immobiliers ou professions assimilees, celui-ci devra faire l'objet de conditions specifiques, d'une signature adaptee et, le cas echeant, de controles relatifs a la carte professionnelle, aux mandats, a l'assurance et a la garantie financiere.$DOC3S3$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 4, '4', 'Nature du service Winelio', $DOC3S4$Winelio fournit un service d'intermédiation commerciale et technique.

Winelio peut notamment :

- recevoir et transmettre des recommandations ;
- permettre au Professionnel d'accepter, refuser ou transferer une opportunite ;
- fournir un workflow de suivi ;
- envoyer des notifications et relances ;
- calculer la commission d'intermédiation due ;
- emettre ou faciliter l'emission d'une facture de commission d'intermédiation ;
- mettre a disposition un lien de paiement via un prestataire tiers.

Winelio n'est pas partie au contrat de prestation conclu entre le Professionnel et le Client final. Le Professionnel reste seul responsable de ses devis, prestations, garanties, assurances, delais, factures, obligations fiscales et obligations envers le Client final.$DOC3S4$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 5, '5', 'Mandat de prospection et mise en relation', $DOC3S5$En utilisant le service professionnel, le Professionnel autorise Winelio a faciliter la recherche et la transmission d'opportunites commerciales correspondant a son activite declaree.

Cette autorisation est :

- non exclusive ;
- limitee au fonctionnement de la plateforme ;
- revocable dans les conditions de resiliation ;
- a titre onereux lorsque la mise en relation aboutit a une operation generant une commission d'intermédiation.

Cette autorisation ne confere pas a Winelio le pouvoir de conclure un contrat au nom du Professionnel, sauf accord ecrit distinct.$DOC3S5$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 6, '6', 'Commission d''intermédiation', $DOC3S6$### 6.1 Principe

Le Professionnel doit a Winelio une commission d'intermédiation lorsqu'une recommandation transmise ou facilitee via Winelio aboutit a une prestation, commande, mission, contrat ou operation payee par le Client final.

### 6.2 Base de calcul

Sauf bareme particulier affiche dans la plateforme ou accepte par ecrit, la commission d'intermédiation est calculee sur le montant TTC de la facture emise par le Professionnel au Client final au titre de l'operation issue de la mise en relation Winelio.

Si le Professionnel n'est pas assujetti a la TVA, la commission d'intermédiation est calculee sur le montant facture au Client final.

### 6.3 Taux

Bareme de travail a valider :

- 10 % du montant TTC de la prestation jusqu'a 25 000 euros TTC ;
- 5 % sur la part du montant TTC excedant 25 000 euros TTC.

Point en attente de validation finale : le seuil de 25 000 euros doit etre precise. Il peut s'agir, selon la decision commerciale retenue, d'un seuil par mission, par client final, par professionnel ou par annee civile.

### 6.4 Fait generateur

La commission d'intermédiation devient exigible lorsque les conditions suivantes sont reunies :

- le Client final a ete mis en relation avec le Professionnel via Winelio ou a la suite d'une recommandation issue de Winelio ;
- le Client final a accepte une offre, un devis, une commande ou un contrat du Professionnel ;
- la prestation a ete realisee et/ou payee selon le workflow applicable ;
- le montant necessaire au calcul de la commission d'intermédiation a ete declare ou justifie.

Les droits a reversement affilie ne deviennent definitivement acquis qu'apres encaissement effectif de la commission d'intermédiation Winelio et expiration des controles applicables.

### 6.5 Declaration du montant reel

Le Professionnel s'engage a declarer le montant reel facture au Client final et a fournir, sur demande, tout justificatif raisonnable : devis accepte, facture, preuve de paiement, attestation de realisation ou document equivalent.

Toute sous-declaration, omission volontaire ou fausse declaration constitue un manquement grave.$DOC3S6$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 7, '7', 'Facturation et paiement', $DOC3S7$Winelio emet ou fait emettre une facture correspondant a la commission d'intermédiation due.

Le paiement peut etre effectue :

- par carte bancaire ;
- par prelevement ou mandat de paiement ;
- via Stripe ou tout autre prestataire de paiement tiers ;
- par tout autre moyen accepte par Winelio.

Winelio n'agit pas comme prestataire de services de paiement. Les operations de paiement sont executees par des prestataires tiers agrees ou habilites, selon leurs propres conditions.

Sauf mention contraire sur la facture ou dans l'application, les sommes dues par le Professionnel sont payables dans un delai de 15 jours a compter de l'emission de la facture ou de la demande de paiement.$DOC3S7$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 8, '8', 'Retard ou defaut de paiement', $DOC3S8$En cas de retard de paiement, des penalites de retard sont exigibles de plein droit le jour suivant la date de reglement figurant sur la facture.

Le taux des penalites de retard est en attente de validation finale, sans pouvoir etre inferieur au minimum legal applicable.

Une indemnite forfaitaire pour frais de recouvrement de 40 euros est due par tout professionnel en situation de retard de paiement, sans prejudice d'une indemnisation complementaire si les frais reels de recouvrement sont superieurs.

Ces mentions s'appuient sur l'article L441-10 du Code de commerce.

Source : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000038414392

En cas de defaut de paiement, Winelio peut :

- suspendre l'acces aux recommandations ;
- suspendre l'acces aux coordonnees de nouveaux contacts ;
- suspendre ou resilier le compte professionnel ;
- engager toute action de recouvrement utile ;
- informer les utilisateurs concernes de facon neutre qu'une operation est en attente de regularisation.$DOC3S8$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 9, '9', 'Interdiction de contournement', $DOC3S9$Le Professionnel s'interdit de contourner Winelio apres une mise en relation, notamment :

- en invitant le Client final a poursuivre hors plateforme afin d'eviter la commission d'intermédiation ;
- en omettant de declarer une operation issue de Winelio ;
- en declarant un montant inferieur au montant reel ;
- en utilisant une autre entite, un sous-traitant ou un compte tiers pour eviter la commission d'intermédiation.

En cas de contournement, Winelio peut reclamer :

- la commission d'intermédiation qui aurait du etre payee ;
- les penalites de retard applicables ;
- les frais de recouvrement ;
- des dommages et interets en reparation du prejudice subi.

Winelio peut egalement suspendre ou resilier le compte du Professionnel.$DOC3S9$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 10, '10', 'Obligations du Professionnel envers le Client final', $DOC3S10$Le Professionnel demeure seul responsable :

- de l'information precontractuelle due au Client final ;
- de ses devis, tarifs, factures et conditions de vente ;
- de l'execution de ses prestations ;
- de ses garanties legales et contractuelles ;
- de ses assurances ;
- de ses obligations fiscales, sociales, comptables et reglementaires ;
- du respect du droit de la consommation lorsque le Client final est un consommateur.

Lorsque le Client final est un consommateur et que le contrat est conclu a distance ou hors etablissement, le Professionnel doit notamment verifier ses obligations relatives au droit de retractation prevu aux articles L221-18 a L221-28 du Code de la consommation.

Source : https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032226844$DOC3S10$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 11, '11', 'Classement, referencement et transparence', $DOC3S11$Winelio peut classer ou afficher les professionnels selon des criteres tels que :

- categorie d'activite ;
- localisation ou zone d'intervention ;
- disponibilite ;
- historique de reponse ;
- statut verifie ;
- acceptation des conditions professionnelles ;
- qualite ou completude du profil ;
- pertinence par rapport a la recommandation.

Winelio peut dereferencer ou limiter l'affichage d'un professionnel en cas d'informations incompletes, de comportement abusif, de non-paiement, de litige grave, de non-respect des obligations legales ou de risque pour les utilisateurs.

Lorsque la loi l'exige, Winelio informe les utilisateurs de maniere loyale, claire et transparente sur les criteres principaux de classement et de referencement.$DOC3S11$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 12, '12', 'Responsabilite de Winelio', $DOC3S12$Winelio ne garantit aucun volume de recommandations, chiffre d'affaires, conversion ou revenu.

Winelio n'est pas responsable :

- du refus d'un Client final ;
- de l'annulation d'une mission ;
- d'un impaye du Client final envers le Professionnel ;
- d'un litige entre le Professionnel et le Client final ;
- de la mauvaise execution d'une prestation par le Professionnel ;
- d'une erreur due a des informations inexactes fournies par le Professionnel.

Dans les limites permises par la loi, la responsabilite de Winelio est limitee aux commissions d'intermédiation effectivement encaissees par Winelio au titre de l'operation litigieuse au cours des trois derniers mois precedant le fait generateur.$DOC3S12$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 13, '13', 'Duree et resiliation', $DOC3S13$Les presentes Conditions Professionnels s'appliquent tant que le Professionnel utilise le service professionnel Winelio.

Le Professionnel peut demander la resiliation de son compte professionnel. Les commissions d'intermédiation dues au titre des mises en relation initiees avant la resiliation restent exigibles.

Winelio peut suspendre ou resilier l'acces professionnel en cas de manquement, fraude, defaut de paiement, risque juridique, perte d'une autorisation professionnelle ou comportement portant atteinte au service.$DOC3S13$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 14, '14', 'Donnees personnelles', $DOC3S14$Les traitements de donnees personnelles relatifs aux professionnels sont decrits dans la Politique de confidentialite.

Le Professionnel reste responsable des traitements de donnees personnelles qu'il realise pour son propre compte avec les Clients finaux, prospects, collaborateurs, sous-traitants ou partenaires. Il s'engage notamment a respecter ses obligations d'information, de minimisation, de securite, de conservation et de gestion des droits des personnes.

Lorsque le Professionnel recoit une recommandation via Winelio, il ne peut utiliser les donnees transmises que pour traiter l'opportunite concernee, repondre a la demande, executer ses obligations contractuelles et conserver les preuves strictement necessaires. Toute prospection ulterieure ou reutilisation des coordonnees du Contact doit reposer sur une base legale propre et respecter les droits de la personne concernee.

Le Professionnel reconnait que certaines informations professionnelles peuvent etre affichees ou transmises aux utilisateurs ou Clients finaux dans le cadre de la mise en relation.$DOC3S14$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 15, '15', 'Droit applicable et litiges', $DOC3S15$Les presentes Conditions Professionnels sont soumises au droit francais.

En cas de litige entre professionnels, les parties rechercheront une solution amiable pendant un delai de 30 jours.

A defaut d'accord, le litige sera soumis aux juridictions competentes dans les conditions du droit commun. Une clause attributive de competence pourra etre ajoutee apres validation de l'entite juridique et du tribunal competent.$DOC3S15$);

  SELECT id INTO v_document_id
  FROM winelio.legal_documents
  WHERE title = 'Programme d''affiliation et Winelio Rewards'
    AND version = '2026-06-04'
  LIMIT 1;

  IF v_document_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Programme d''affiliation et Winelio Rewards', '2026-06-04', 'draft')
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE winelio.legal_documents
    SET status = 'draft', updated_at = now()
    WHERE id = v_document_id;

    DELETE FROM winelio.document_sections
    WHERE document_id = v_document_id;
  END IF;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 1, '1', 'Objet', $DOC4S1$Le present reglement definit les conditions dans lesquelles un utilisateur Winelio peut participer au programme d'affiliation et recevoir, sous conditions, des commissions d'intermédiation ou avantages lies a des recommandations ayant abouti a des prestations reelles.

Il complete les CGU et les Conditions Professionnels.$DOC4S1$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 2, '2', 'Principe fondamental', $DOC4S2$Le programme Winelio repose exclusivement sur des prestations reelles, fournies par des professionnels, facturees et payees.

Aucune commission d'intermédiation, prime, remuneration ou avantage financier n'est verse pour :

- la simple inscription d'un utilisateur ;
- la simple invitation d'une personne ;
- la constitution d'une equipe ;
- l'achat d'un droit d'entree ;
- la progression du nombre de personnes recrutees.

Les commissions d'intermédiation sont uniquement calculees sur une commission d'intermédiation effectivement due et encaissee par Winelio au titre d'une operation reelle.

Cette clause est essentielle afin d'ecarter tout mecanisme de vente pyramidale prohibe par l'article L121-15 du Code de la consommation.

Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032227258$DOC4S2$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 3, '3', 'Eligibilite', $DOC4S3$Pour participer au programme, l'utilisateur doit :

- disposer d'un compte Winelio actif ;
- etre majeur et capable ;
- avoir accepte les CGU ;
- respecter les regles de parrainage et de recommandation ;
- fournir les informations et justificatifs demandes par Winelio ;
- etre legalement autorise a percevoir les sommes concernees.

Winelio peut refuser, suspendre ou limiter l'acces au programme en cas de fraude, suspicion de fraude, informations inexactes, non-respect des obligations fiscales/sociales ou risque juridique.$DOC4S3$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 4, '4', 'Code parrain et reseau', $DOC4S4$Chaque utilisateur eligible peut disposer d'un code parrain unique.

Le code parrain ne constitue pas un droit de propriete, une clientele personnelle cessible ou une garantie de revenu.

Winelio peut suspendre, remplacer ou desactiver un code parrain en cas de fraude, erreur technique, suppression de compte, atteinte au service ou obligation legale.

Les codes de parrainage supprimes peuvent etre reserves definitivement afin d'eviter toute confusion ou reutilisation abusive.$DOC4S4$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 5, '5', 'Repartition de travail', $DOC4S5$Sous reserve de validation commerciale et comptable, la commission d'intermédiation Winelio peut etre repartie selon le schema suivant :

- recommandeur direct : 60 % de la commission d'intermédiation Winelio ;
- sponsor de niveau 1 : 3 % ;
- sponsor de niveau 2 : 3 % ;
- sponsor de niveau 3 : 3 % ;
- sponsor de niveau 4 : 3 % ;
- sponsor de niveau 5 : 3 % ;
- bonus sponsor du professionnel : 1 % ;
- cashback professionnel en Wins : 1 % ;
- cagnotte / plateforme Winelio : 23 %.

Cette repartition totalise 100 % de la commission d'intermédiation Winelio. Elle correspond au plan standard actif constate en base le 2026-06-04.

Les pourcentages peuvent varier selon les plans de compensation, categories, operations, offres promotionnelles ou modifications du programme, sous reserve d'information des utilisateurs.$DOC4S5$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 6, '6', 'Conditions d''acquisition', $DOC4S6$Une commission d'intermédiation affiliee n'est acquise que si :

- la recommandation est licite et conforme aux CGU ;
- le professionnel accepte et traite la recommandation ;
- une prestation reelle est conclue avec le Client final ;
- le montant facture est declare ou justifie ;
- la commission d'intermédiation Winelio est due et effectivement encaissee ;
- aucun remboursement, annulation, litige bloquant, fraude ou contournement n'est constate.

Winelio peut afficher des montants "en attente", "estimes" ou "pending". Ces montants ne constituent pas un droit definitif au paiement.$DOC4S6$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 7, '7', 'Spillover et chaines incompletes', $DOC4S7$Si un niveau de parrainage n'existe pas, si un compte est suspendu, si un beneficiaire est ineligible ou si une commission d'intermédiation ne peut pas etre distribuee, la part correspondante peut etre :

- conservee en attente ;
- affectee a la cagnotte Winelio ;
- annulee ;
- redistribuee selon le plan applicable.

Le traitement depend du plan de compensation en vigueur au moment de l'operation.$DOC4S7$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 8, '8', 'Bonus d''affiliation professionnel', $DOC4S8$Lorsqu'un professionnel rejoint Winelio grace a un utilisateur et genere ensuite une commission d'intermédiation Winelio, un bonus peut etre attribue au sponsor du professionnel.

Bareme de travail : 1 % de la commission d'intermédiation Winelio effectivement encaissee.

Ce bonus ne constitue pas une remuneration pour simple recrutement. Il est conditionne a une operation reelle generatrice de commission d'intermédiation.$DOC4S8$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 9, '9', 'Winelio Rewards / Wins', $DOC4S9$Winelio peut attribuer des Wins ou avantages internes a certains professionnels actifs.

Les Wins :

- ne sont pas de la monnaie legale ;
- ne sont pas convertibles automatiquement en euros ;
- ne sont pas transferables hors conditions prevues par Winelio ;
- ne constituent pas un salaire, revenu garanti ou instrument financier ;
- peuvent etre utilises uniquement pour des avantages, remises, services promotionnels ou offres partenaires definis par Winelio.

Bareme de travail : 1 % des commissions d'intermédiation Winelio generees par le professionnel, attribue en Wins selon les conditions affichees dans l'application.

Winelio peut modifier, suspendre ou arreter le programme Rewards, sous reserve des droits deja definitivement acquis.$DOC4S9$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 10, '10', 'Retraits', $DOC4S10$Les commissions d'intermédiation disponibles peuvent faire l'objet d'une demande de retrait selon les moyens proposes par Winelio.

Les retraits sont soumis :

- a l'existence d'un solde disponible ;
- a la verification de l'identite et des informations de paiement ;
- a la verification du statut fiscal/social si necessaire ;
- aux controles anti-fraude ;
- aux delais bancaires et techniques ;
- aux frais affiches dans l'application.

Sauf modification affichee :

- retrait egal ou superieur a 50 euros : pas de frais fixes Winelio ;
- retrait inferieur a 50 euros : frais fixes de 0,25 euro.

Winelio peut differer ou refuser un retrait en cas de suspicion de fraude, operation litigieuse, compte incomplet, absence de justificatifs ou obligation legale.$DOC4S10$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 11, '11', 'Fiscalite et statut de l''affilie', $DOC4S11$L'affilie est seul responsable de la declaration des sommes percues et du respect de ses obligations fiscales, sociales et comptables.

Selon la frequence, le montant et la nature de son activite, l'affilie peut devoir disposer d'un statut juridique, fiscal ou social adapte.

Winelio peut demander tout justificatif necessaire avant de proceder a un retrait ou a la poursuite des reversements.$DOC4S11$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 12, '12', 'Fraude et abus', $DOC4S12$Sont notamment interdits :

- fausses recommandations ;
- auto-recommandations non autorisees ;
- creation de comptes fictifs ;
- manipulation de la chaine de parrainage ;
- utilisation de donnees de tiers sans autorisation ;
- operations circulaires sans prestation reelle ;
- contournement de Winelio ;
- pression commerciale trompeuse promettant des revenus garantis.

En cas de fraude ou suspicion serieuse, Winelio peut suspendre le compte, bloquer les retraits, annuler les commissions d'intermédiation, demander le remboursement des sommes indues et engager toute action utile.$DOC4S12$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 13, '13', 'Absence de lien de subordination', $DOC4S13$Les affilies agissent en toute independance.

Le programme ne cree aucun lien de salariat, mandat social, association, franchise, agence commerciale ou subordination entre Winelio et l'affilie, sauf contrat distinct expressement signe.

L'affilie ne peut pas engager Winelio, signer au nom de Winelio ou presenter Winelio comme garantissant un revenu.$DOC4S13$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 14, '14', 'Communication du programme', $DOC4S14$Toute communication relative au programme doit etre loyale, exacte et non trompeuse.

Il est interdit de promettre des gains automatiques, garantis ou principalement lies au recrutement.

Toute presentation publique du programme doit rappeler que les commissions d'intermédiation dependent de prestations reelles et du respect des conditions Winelio.$DOC4S14$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 15, '15', 'Modification du programme', $DOC4S15$Winelio peut modifier le programme, les taux, les conditions d'eligibilite, les seuils, les frais ou les modalites de retrait.

Les utilisateurs seront informes par tout moyen approprie. Les droits definitivement acquis avant modification demeurent reserves, sauf fraude, erreur ou obligation legale contraire.$DOC4S15$);

  SELECT id INTO v_document_id
  FROM winelio.legal_documents
  WHERE title = 'Politique de confidentialité'
    AND version = '2026-06-04'
  LIMIT 1;

  IF v_document_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Politique de confidentialité', '2026-06-04', 'draft')
    RETURNING id INTO v_document_id;
  ELSE
    UPDATE winelio.legal_documents
    SET status = 'draft', updated_at = now()
    WHERE id = v_document_id;

    DELETE FROM winelio.document_sections
    WHERE document_id = v_document_id;
  END IF;

  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 1, '1', 'Objet', $DOC5S1$La presente politique explique comment Winelio collecte, utilise, conserve et protege les donnees personnelles des utilisateurs, professionnels, clients finaux, contacts recommandes, visiteurs et prospects.

Elle est etablie au regard du Reglement (UE) 2016/679 du 27 avril 2016, dit RGPD, de la loi Informatique et Libertes, et des recommandations publiees par la CNIL.

Sources de reference :

- [CNIL - Les bases legales du RGPD](https://cnil.fr/fr/les-bases-legales/liceite-essentiel-sur-les-bases-legales)
- [CNIL - Les durees de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees)
- [CNIL - Les droits des personnes](https://cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees)
- [CNIL - Responsable de traitement et sous-traitants](https://cnil.fr/fr/rgpd-comment-bien-identifier-son-role)$DOC5S1$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 2, '2', 'Responsable du traitement', $DOC5S2$Le responsable du traitement est :

- Denomination : en attente de validation
- Forme juridique : en attente de validation
- Adresse du siege : en attente de validation
- Email de contact RGPD : en attente de validation. Dans l'intervalle, les demandes peuvent etre adressees a contact@winelio.app.

Winelio determine les finalites et les moyens essentiels des traitements realises dans le cadre de la plateforme. Les professionnels utilisant Winelio restent responsables des traitements qu'ils realisent pour leur propre compte avec leurs clients, prospects, collaborateurs ou partenaires.$DOC5S2$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 3, '3', 'En resume', $DOC5S3$Winelio traite les donnees personnelles uniquement pour faire fonctionner la plateforme, securiser les comptes, gerer les recommandations, calculer les commissions d'intermédiation, traiter les retraits, respecter ses obligations legales et ameliorer le service.

Winelio ne vend pas les donnees personnelles des utilisateurs.

Les donnees transmises par un utilisateur au sujet d'un tiers, notamment dans une recommandation, doivent etre obtenues et transmises licitement. L'utilisateur qui transmet ces donnees doit informer la personne concernee lorsque cela est requis.$DOC5S3$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 4, '4', 'Donnees collectees', $DOC5S4$Winelio peut traiter les categories de donnees suivantes, selon le role de la personne concernee et les fonctionnalites utilisees :

- identite : nom, prenom, date de naissance lorsque necessaire ;
- coordonnees : email, telephone, adresse, zone geographique ou zone d'intervention ;
- donnees de compte : identifiant, role, statut professionnel, sponsor, code parrain, historique d'acceptation des documents contractuels ;
- donnees professionnelles : SIRET, SIREN, denomination, categorie, zone d'intervention, justificatifs, assurances, informations publiques d'entreprise, statut de verification ;
- donnees de recommandation : description du besoin, contact recommande, professionnel pressenti, statut, montant du devis ou de la facture, historique des etapes, commentaires operationnels ;
- donnees financieres : cagnotte, commissions d'intermédiation, retraits, frais, informations necessaires a l'execution d'un reversement ;
- donnees de paiement : informations traitees par les prestataires de paiement, sans stockage par Winelio des donnees completes de carte bancaire ;
- donnees de signature et de preuve : date, heure, adresse IP, version du document accepte, preuve d'acceptation, empreinte du document si applicable ;
- donnees techniques : adresse IP, logs de connexion, navigateur, terminal, horodatages, evenements de securite ;
- donnees email : envoi, reception, clics, erreurs de delivrabilite, horodatages ;
- donnees de support : messages, tickets, pieces jointes, signalements, historique de traitement ;
- donnees de preferences : theme, notifications, parametres utilisateur.

Winelio ne collecte pas de numero de securite sociale, de donnees de sante, de donnees biometrie, de donnees relatives aux opinions politiques, aux convictions religieuses ou a l'appartenance syndicale, sauf obligation legale particuliere ou demande expresse et justifiee d'une autorite competente.$DOC5S4$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 5, '5', 'Sources des donnees', $DOC5S5$Les donnees peuvent provenir :

- de la personne concernee elle-meme ;
- d'un utilisateur ou affilie effectuant une recommandation ;
- d'un professionnel utilisant le service ;
- d'un client final ou contact dans le cadre d'une mise en relation ;
- de bases publiques d'entreprises ;
- de prestataires techniques ;
- d'un administrateur habilite de Winelio.$DOC5S5$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 6, '6', 'Donnees transmises par un tiers dans une recommandation', $DOC5S6$Lorsqu'un utilisateur transmet a Winelio les donnees personnelles d'un tiers, par exemple les coordonnees d'un client final ou d'un contact recommande, il s'engage a :

- transmettre uniquement les donnees necessaires a la mise en relation ;
- ne pas transmettre de donnees sensibles ou excessives ;
- disposer d'une base legitime pour cette transmission ;
- informer la personne concernee de la transmission de ses donnees a Winelio, de la finalite de mise en relation, des destinataires possibles et de ses droits, lorsque cette information est requise ;
- obtenir le consentement de la personne concernee lorsque le RGPD ou les regles de prospection l'exigent ;
- ne pas utiliser Winelio pour envoyer des recommandations frauduleuses, trompeuses, non sollicitees ou manifestement contraires aux droits de la personne concernee.

Winelio peut supprimer, bloquer ou limiter le traitement d'une recommandation si elle apparait abusive, frauduleuse, excessive, incomplete, illicite ou contestee par la personne concernee.$DOC5S6$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 7, '7', 'Finalites, bases legales et durees de conservation', $DOC5S7$Les donnees ne sont conservees que pendant la duree necessaire aux finalites poursuivies, puis supprimees ou archivees lorsque cela est requis pour respecter une obligation legale, etablir une preuve ou gerer un litige.

Les durees ci-dessous sont publiees en attente de validation finale.

| Traitement | Finalite | Base legale | Duree indicative |
| --- | --- | --- | --- |
| Creation et gestion du compte | Authentifier l'utilisateur, gerer le profil, les roles, le sponsor et l'acces aux fonctionnalites | Execution du contrat ou mesures precontractuelles | Duree du compte, puis archivage jusqu'a 5 ans pour preuve et litiges |
| Parrainage obligatoire et reseau | Verifier le code parrain, rattacher le compte a un sponsor, prevenir les abus du reseau | Execution du contrat et interet legitime de securisation | Duree du compte, puis jusqu'a 5 ans apres la derniere activite |
| Recommandations et mise en relation | Transmettre une opportunite, suivre le workflow, notifier les parties, documenter l'avancement | Execution du contrat et interet legitime des parties a organiser la mise en relation | Duree de traitement de la recommandation, puis jusqu'a 5 ans pour preuve |
| Gestion des professionnels | Verifier le SIRET, la categorie, la zone, les justificatifs et le statut professionnel | Execution du contrat, obligation legale selon l'activite, interet legitime de securisation | Duree du compte professionnel, puis jusqu'a 5 ans, ou plus si obligation legale |
| Commissions d'intermédiation, wallet et retraits | Calculer les commissions d'intermédiation, gerer les soldes, valider les demandes de retrait, prevenir la fraude | Execution du contrat, obligations legales comptables et fiscales, interet legitime anti-fraude | Donnees operationnelles pendant la relation, pieces comptables jusqu'a 10 ans |
| Paiements | Executer ou faciliter les paiements, encaissements, reversements et relances | Execution du contrat, obligations legales, interet legitime de recouvrement | Selon le prestataire et les obligations comptables, justificatifs jusqu'a 10 ans |
| Emails transactionnels et notifications | Envoyer les OTP, invitations, alertes, relances et informations de suivi | Execution du contrat et interet legitime | Duree necessaire a l'envoi et a la preuve, puis jusqu'a 3 ans selon le contexte |
| Mesure d'ouverture et de clic des emails | Suivre la delivrabilite, securiser les envois, prouver l'envoi, ameliorer les relances | Interet legitime, sous reserve du droit d'opposition | Jusqu'a 13 mois pour les traceurs, ou jusqu'a la duree de preuve applicable |
| Prospection commerciale | Informer sur Winelio, les nouveautes, offres ou services proches | Consentement lorsque requis ou interet legitime en B2B pertinent | Jusqu'a 3 ans apres le dernier contact actif ou jusqu'a opposition |
| Support et reclamations | Repondre aux demandes, resoudre les incidents, traiter les contestations | Execution du contrat, interet legitime, obligation legale selon le cas | Jusqu'a 5 ans apres cloture selon la nature de la demande |
| Securite et prevention de la fraude | Detecter les abus, proteger les comptes, tracer les incidents, auditer les operations sensibles | Interet legitime et obligations legales | Logs jusqu'a 12 mois, sauf incident, fraude ou obligation plus longue |
| Obligations legales et contentieux | Tenir la comptabilite, repondre aux autorites, gerer les litiges et conserver les preuves | Obligation legale, interet legitime, exercice ou defense de droits en justice | Selon les delais legaux applicables, notamment 10 ans pour les pieces comptables |
| Cookies et preferences | Maintenir la session, securiser le service, memoriser les preferences, mesurer l'audience si activee | Interet legitime pour les traceurs necessaires, consentement pour les autres | Jusqu'a 13 mois pour les traceurs soumis a consentement, sauf duree plus courte |$DOC5S7$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 8, '8', 'Destinataires', $DOC5S8$Les donnees peuvent etre accessibles, uniquement selon les besoins et les habilitations :

- aux equipes habilitees de Winelio ;
- aux utilisateurs, professionnels ou contacts concernes par une recommandation ou une mise en relation ;
- aux prestataires d'hebergement, de base de donnees et de stockage ;
- aux prestataires email et notification ;
- aux prestataires de paiement et de reversement ;
- aux prestataires de monitoring, securite, support et bug tracking ;
- aux conseils, experts-comptables, avocats, auditeurs ou assureurs de Winelio lorsque necessaire ;
- aux autorites administratives, fiscales, judiciaires ou de controle lorsque la loi l'exige.$DOC5S8$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 9, '9', 'Sous-traitants', $DOC5S9$Winelio peut faire appel a des sous-traitants au sens du RGPD pour heberger, stocker, envoyer, securiser, superviser ou traiter certaines donnees necessaires au service.

Les sous-traitants doivent traiter les donnees uniquement sur instruction de Winelio, offrir des garanties suffisantes, aider Winelio a respecter ses obligations RGPD lorsque cela est applicable, et encadrer leurs propres sous-traitants.

Prestataires en attente de validation finale :

- Supabase : authentification, base de donnees, stockage et services associes ;
- hebergeur VPS / Coolify / infrastructure : hebergement applicatif et technique ;
- prestataire SMTP : emails transactionnels et invitations ;
- prestataire de paiement ou reversement : paiements, encaissements, retraits et conformite associee ;
- outil de monitoring ou bug tracking : supervision technique, securite et resolution d'incidents ;
- outil d'audience ou analytics, uniquement s'il est effectivement active.$DOC5S9$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 10, '10', 'Transferts hors Union europeenne', $DOC5S10$Certains prestataires peuvent traiter des donnees hors Union europeenne ou dans des pays ne beneficiant pas d'une decision d'adequation.

Dans ce cas, Winelio met en place ou verifie l'existence de garanties appropriees, notamment clauses contractuelles types de la Commission europeenne, regles d'entreprise contraignantes, mesures supplementaires de securite ou recours a des prestataires offrant des garanties conformes au RGPD.

Point en attente de validation finale : confirmer la liste exacte des prestataires, leurs pays de traitement et les garanties contractuelles applicables.$DOC5S10$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 11, '11', 'Droits des personnes', $DOC5S11$Conformement au RGPD, les personnes concernees peuvent disposer, selon les cas et les bases legales applicables, des droits suivants :

- droit d'acces ;
- droit de rectification ;
- droit d'effacement ;
- droit a la limitation du traitement ;
- droit d'opposition ;
- droit a la portabilite des donnees fournies ;
- droit de retirer un consentement a tout moment, sans affecter la liceite du traitement effectue avant le retrait ;
- droit de ne pas faire l'objet d'une decision fondee exclusivement sur un traitement automatise produisant des effets juridiques ou significatifs similaires ;
- droit d'obtenir une intervention humaine lorsqu'une decision automatisee applicable le requiert ;
- droit de definir des directives relatives au sort des donnees apres le deces.

Pour exercer ces droits :

Contact RGPD en attente de validation. Dans l'intervalle, les demandes peuvent etre adressees a contact@winelio.app.

Winelio pourra demander une verification d'identite lorsque cela est necessaire pour proteger les donnees de la personne concernee.

Les personnes disposent egalement du droit d'introduire une reclamation aupres de la CNIL :

[CNIL - Plaintes](https://www.cnil.fr/fr/plaintes)$DOC5S11$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 12, '12', 'Prospection commerciale', $DOC5S12$Winelio peut adresser des communications relatives a ses services, nouveautes ou offres, dans le respect des regles applicables a la prospection electronique.

Lorsque le consentement est requis, Winelio recueille ce consentement avant l'envoi. Lorsque la prospection repose sur l'interet legitime, notamment dans certains cas de prospection B2B pertinente, chaque personne peut s'y opposer facilement et gratuitement.

Source :

- [CNIL - Prospection par courrier electronique](https://www.cnil.fr/fr/les-regles-dor-de-la-prospection-par-courrier-electronique-0)$DOC5S12$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 13, '13', 'Cookies et traceurs', $DOC5S13$Winelio peut utiliser des cookies ou traceurs :

- strictement necessaires au fonctionnement du service ;
- d'authentification et de securite ;
- de preference utilisateur ;
- de mesure d'audience ;
- eventuellement de marketing ou de suivi, sous reserve du consentement lorsque requis.

Les traceurs non strictement necessaires sont soumis a information et, lorsque la loi l'exige, au consentement prealable.

Source :

- [CNIL - Cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)$DOC5S13$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 14, '14', 'Securite', $DOC5S14$Winelio met en oeuvre des mesures techniques et organisationnelles destinees a proteger les donnees personnelles, notamment :

- controle d'acces et habilitations ;
- authentification par email et protection des sessions ;
- politiques RLS sur les donnees applicatives ;
- separation des roles utilisateurs et administrateurs ;
- journalisation et audit de certaines operations sensibles ;
- sauvegardes et surveillance technique ;
- limitation des acces aux donnees selon les besoins ;
- stockage prive de certains fichiers ;
- revue des incidents et correctifs de securite.

Aucune mesure de securite n'etant absolue, l'utilisateur doit egalement proteger l'acces a son compte et signaler sans delai toute suspicion de compromission.$DOC5S14$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 15, '15', 'Exactitude et minimisation', $DOC5S15$Winelio demande aux utilisateurs de transmettre uniquement des informations exactes, pertinentes et necessaires au fonctionnement du service.

Les utilisateurs peuvent mettre a jour leurs donnees depuis l'application lorsque la fonctionnalite est disponible ou contacter Winelio pour demander une rectification.$DOC5S15$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 16, '16', 'Modification de la politique', $DOC5S16$Winelio peut modifier la presente politique de confidentialite afin de tenir compte des evolutions du service, de la loi, des prestataires ou des recommandations des autorites competentes.

En cas de modification substantielle, les utilisateurs seront informes par tout moyen approprie. Lorsque cela est requis, une nouvelle acceptation ou un nouveau consentement pourra etre demande.$DOC5S16$);
  INSERT INTO winelio.document_sections (document_id, order_index, article_number, title, content)
  VALUES (v_document_id, 17, '17', 'Information au titre du RGPD', $DOC5S17$L'article 13 du RGPD impose notamment d'informer les personnes sur l'identite du responsable de traitement, les finalites, les bases legales, les destinataires, les durees de conservation, les droits et l'existence d'un recours aupres d'une autorite de controle.

Cette politique a vocation a fournir cette information de maniere claire et accessible. Les informations d'identification administrative et la liste exacte des prestataires seront completees apres validation finale.$DOC5S17$);

END $$;

COMMIT;
