# Spec — CGU Agents Immobiliers Winelio

**Date :** 2026-04-15
**Projet :** Winelio (`dev2`)
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Les agents immobiliers et tout professionnel soumis à la loi Hoguet sont soumis à des CGU distinctes, conclues par voie de signature électronique (sous-projet 3). Ces CGU remplacent les CGU Professionnels standard pour ce profil. Elles partagent la même structure (13 articles), avec des adaptations sur l'acceptation, la conformité réglementaire et les obligations spécifiques au secteur.

Ce document est le sous-projet 2/3. Il dépend du système de documents annotables (déjà en place) et sera associé au flow de signature électronique (sous-projet 3).

---

## Placeholders à remplacer avant mise en production

| Placeholder | Valeur attendue |
|-------------|----------------|
| `[RAISON SOCIALE]` | Nom légal de la société Winelio |
| `[SIREN]` | Numéro d'immatriculation RCS |
| `[ADRESSE]` | Siège social |
| `[DATE D'ENTRÉE EN VIGUEUR]` | Date de mise en ligne |
| `[EMAIL RGPD]` | Email du responsable de traitement |
| `[TRIBUNAL COMPÉTENT]` | Tribunal du siège social |
| `[NUMÉRO CARTE T]` | Numéro de carte professionnelle T (transaction) de Winelio, si applicable |
| `[MENTION LOI HOGUET]` | Référence légale à compléter par le conseil juridique |

---

## Intégration dans le wizard

- **Condition de déclenchement :** l'agent immobilier accède à ces CGU uniquement si sa catégorie est identifiée comme "Agent immobilier" (ou profil soumis loi Hoguet)
- **Rendu :** non présenté via checkbox — ces CGU font l'objet d'une signature électronique (sous-projet 3)
- **Bouton "Signer les CGU"** : redirige vers `/sign/[token]` (sous-projet 3)

---

## Seed dans le système de documents

Ces CGU sont insérées comme second document dans `legal_documents` :
- title: "CGU Agents Immobiliers"
- version: "1.0"
- status: "reviewing"

---

## Texte des CGU

---

# CONDITIONS GÉNÉRALES D'UTILISATION — AGENTS IMMOBILIERS

**Version 1.0 — [DATE D'ENTRÉE EN VIGUEUR]**

---

### Article 1 — Objet

Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») régissent les relations contractuelles entre la société **[RAISON SOCIALE]**, immatriculée au RCS sous le numéro **[SIREN]**, dont le siège social est situé **[ADRESSE]** (ci-après « Winelio »), et tout agent immobilier ou professionnel soumis à la loi n° 70-9 du 2 janvier 1970 dite « loi Hoguet » ayant signé électroniquement les présentes CGU lors de l'activation de son compte Professionnel sur la plateforme Winelio (ci-après « l'Agent »).

La plateforme Winelio est un service de mise en relation par recommandation entre des clients potentiels (ci-après « Clients ») et des Professionnels référencés.

Les présentes CGU sont distinctes des Conditions Générales d'Utilisation Professionnels standard. Elles s'appliquent exclusivement aux Agents tels que définis ci-dessus.

---

### Article 2 — Acceptation des CGU

L'activation du statut Professionnel Agent Immobilier sur la plateforme vaut acceptation pleine et entière des présentes CGU. Cette acceptation est matérialisée par la **signature électronique** des présentes dans le cadre de la procédure d'enregistrement dédiée.

La signature électronique est réalisée via l'interface sécurisée de la plateforme Winelio. Elle génère un horodatage certifié, une empreinte cryptographique (SHA-256) du document signé, ainsi qu'un enregistrement de l'adresse IP et du navigateur utilisés au moment de la signature. Ces éléments constituent la preuve d'acceptation opposable.

Les présentes CGU prévalent sur tout autre document, sauf accord écrit contraire signé par Winelio.

Winelio se réserve le droit de modifier les présentes CGU à tout moment. L'Agent sera informé de toute modification par email. En cas de modification substantielle, une nouvelle signature électronique sera requise.

---

### Article 3 — Conformité réglementaire — Loi Hoguet

L'Agent déclare exercer son activité en conformité avec la loi n° 70-9 du 2 janvier 1970 et ses décrets d'application (loi Hoguet), notamment :

- Être titulaire d'une carte professionnelle valide délivrée par la Chambre de Commerce et d'Industrie compétente ;
- Disposer d'une garantie financière suffisante couvrant les fonds détenus pour le compte de tiers ;
- Être titulaire d'une assurance de responsabilité civile professionnelle.

**[MENTION LOI HOGUET]**

L'Agent s'engage à informer immédiatement Winelio de tout changement affectant sa situation réglementaire (expiration ou retrait de carte, changement de statut, etc.). Winelio se réserve le droit de suspendre le compte Professionnel dans l'attente de régularisation.

Winelio n'est pas mandataire immobilier au sens de la loi Hoguet. La plateforme est un service de mise en relation par recommandation. Toute transaction immobilière éventuellement conclue à la suite d'une mise en relation reste soumise aux obligations légales de l'Agent, notamment en matière de mandat écrit et de formalités obligatoires.

---

### Article 4 — Mandat de prospection

En acceptant les présentes CGU, l'Agent **donne mandat exprès à Winelio** d'agir en son nom pour la recherche et la mise en relation avec des clients potentiels correspondant à son activité professionnelle déclarée.

Ce mandat est :
- **non-exclusif** : l'Agent reste libre d'exercer son activité par tous autres canaux ;
- **à titre onéreux** : il donne lieu au versement de la commission définie à l'Article 6 ;
- **révocable** : il prend fin à la résiliation du compte Professionnel.

Le présent mandat de prospection est distinct de tout mandat immobilier réglementé. Il ne saurait se substituer aux obligations de l'Agent en vertu de la loi Hoguet.

---

### Article 5 — Obligations de l'Agent

L'Agent s'engage à :

1. **Traiter chaque mise en relation avec sérieux et réactivité**, en répondant à toute recommandation dans un délai raisonnable ;
2. **Renseigner fidèlement** ses informations professionnelles (activité, numéro de carte T, zone d'intervention) et les tenir à jour ;
3. **Suivre l'avancement de chaque mission** directement via l'application Winelio, en complétant les étapes du workflow de recommandation ;
4. **Déclarer le montant réel des honoraires** perçus à l'issue d'une mission issue d'une mise en relation Winelio ;
5. **Régler la commission due** à Winelio dans les conditions définies à l'Article 6 ;
6. **Ne pas contourner la commission** dans les conditions définies à l'Article 7 ;
7. **Maintenir à jour** sa situation réglementaire conformément à l'Article 3.

---

### Article 6 — Commission

#### 6.1 Taux

En contrepartie de chaque mise en relation ayant donné lieu à la conclusion d'une affaire, l'Agent s'engage à verser à Winelio une commission calculée sur le montant **TTC des honoraires perçus du Client**.

Le taux de commission est fixé à **10 % maximum TTC**, selon le barème en vigueur publié sur la plateforme. Des réductions de taux peuvent s'appliquer en fonction du montant des honoraires, conformément audit barème.

#### 6.2 Fait générateur

La commission est due dès lors que :
- un Client mis en relation via la plateforme Winelio a conclu un mandat ou passé une commande auprès de l'Agent ;
- l'Agent a validé l'étape « Devis accepté » dans son workflow de recommandation.

#### 6.3 Modalités de règlement

La commission est prélevée ou facturée selon les modalités définies dans la plateforme. L'Agent s'engage à s'acquitter de la commission dans un délai de **15 jours** à compter de la validation de la mission.

---

### Article 7 — Interdiction de contournement

Il est **formellement interdit** à l'Agent de solliciter ou de traiter directement avec un Client mis en relation via la plateforme Winelio dans le but de contourner le paiement de la commission, notamment :

- en proposant au Client de traiter hors plateforme après une première mise en relation ;
- en ne déclarant pas une mission réalisée suite à une recommandation Winelio ;
- en sous-déclarant le montant réel des honoraires.

#### Sanctions

Tout manquement avéré à cette obligation autorise Winelio à :

1. **Réclamer immédiatement la commission due, majorée de 50 %** à titre de pénalité forfaitaire ;
2. **Suspendre ou résilier le compte** de l'Agent sans préavis ni indemnité ;
3. **Engager toute procédure nécessaire** au recouvrement des sommes dues, y compris judiciaire, les frais de recouvrement restant à la charge de l'Agent.

Ces sanctions sont cumulatives et sans préjudice de tout autre recours.

---

### Article 8 — Obligations de Winelio

Winelio s'engage à :

1. Mettre à disposition une plateforme fonctionnelle permettant la réception et le suivi des recommandations ;
2. Notifier l'Agent de toute nouvelle mise en relation ;
3. Assurer la confidentialité des données de l'Agent conformément à l'Article 10 ;
4. Informer l'Agent de toute modification tarifaire au moins **30 jours à l'avance**.

---

### Article 9 — Durée et résiliation

#### 9.1 Durée

Les présentes CGU entrent en vigueur à la date de signature électronique et sont conclues pour une **durée indéterminée**.

#### 9.2 Résiliation à l'initiative de l'Agent

L'Agent peut résilier son compte Professionnel à tout moment depuis les paramètres de l'application, sous réserve de s'acquitter de l'ensemble des commissions dues au titre des missions en cours ou terminées.

#### 9.3 Résiliation à l'initiative de Winelio

Winelio peut suspendre ou résilier le compte Professionnel :
- **sans préavis**, en cas de manquement grave (notamment violation des Articles 3, 5 ou 7) ou de perte de la carte professionnelle ;
- **avec un préavis de 30 jours**, pour tout autre motif légitime.

#### 9.4 Effets de la résiliation

La résiliation met fin au mandat défini à l'Article 4. Les commissions dues au titre des missions initiées avant la date de résiliation restent exigibles.

---

### Article 10 — Données personnelles (RGPD)

Winelio collecte et traite les données personnelles de l'Agent dans le cadre de l'exécution du contrat et du respect de ses obligations légales, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.

La signature électronique des présentes génère des données de traçabilité (adresse IP, horodatage, empreinte cryptographique) conservées à des fins probatoires conformément aux exigences légales applicables.

L'Agent dispose d'un droit d'accès, de rectification, d'effacement, de portabilité et d'opposition sur ses données, exerceable à l'adresse : **[EMAIL RGPD]**.

Pour plus d'informations, se référer à la Politique de Confidentialité disponible sur la plateforme.

---

### Article 11 — Responsabilité

Winelio est un intermédiaire de mise en relation. Elle ne peut être tenue responsable :
- de la qualité des prestations réalisées par l'Agent ;
- d'un différend entre l'Agent et un Client ;
- de l'absence de mise en relation en cas de faible activité sur la plateforme ;
- du non-respect par l'Agent de ses obligations légales au titre de la loi Hoguet.

La responsabilité de Winelio est en tout état de cause limitée au montant des commissions effectivement perçues au titre des trois (3) derniers mois précédant le fait générateur du litige.

---

### Article 12 — Droit applicable et juridiction

Les présentes CGU sont soumises au **droit français**.

En cas de litige, les parties s'engagent à rechercher une solution amiable préalablement à tout recours judiciaire. À défaut d'accord dans un délai de 30 jours, le litige sera porté devant le **[TRIBUNAL COMPÉTENT]**.

---

### Article 13 — Dispositions diverses

- **Intégralité** : les présentes CGU constituent l'intégralité de l'accord entre les parties sur leur objet.
- **Divisibilité** : si une clause est déclarée nulle, les autres clauses restent en vigueur.
- **Non-renonciation** : le fait pour Winelio de ne pas se prévaloir d'un manquement ne vaut pas renonciation à s'en prévaloir ultérieurement.
- **Primauté** : les présentes CGU prennent le pas sur les CGU Professionnels standard pour tout professionnel relevant de la loi Hoguet.

---

*En signant électroniquement les présentes lors de l'activation de son compte Professionnel Agent Immobilier, l'Agent reconnaît avoir lu, compris et accepté sans réserve les présentes Conditions Générales d'Utilisation.*

---

## Différences clés avec les CGU Professionnels standard

| Point | CGU Pro standard | CGU Agents Immobiliers |
|-------|-----------------|----------------------|
| Acceptation | Checkbox | Signature électronique |
| Art. 3 | Absent | Conformité loi Hoguet (carte T, garantie, RC pro) |
| Art. 4 | Mandat exprès | Mandat exprès + précision non-mandataire immobilier |
| Art. 11 | Cas particuliers agents (exclusion) | Supprimé — remplacé par article Responsabilité |
| Numérotation | Art. 1-13 | Art. 1-13 (Art. 3 loi Hoguet intercalé, Art. 11 ancienne exclusion supprimée) |
| Traçabilité signature | Horodatage + IP + user agent | Idem + empreinte SHA-256 mentionnée dans art. 2 |

---

## Seed dans le système de documents annotables

Le seed insère :
1. Un enregistrement dans `legal_documents` (title: "CGU Agents Immobiliers", version: "1.0", status: "reviewing")
2. 13 enregistrements dans `document_sections` (un par article)

Fichier seed : `supabase/seeds/legal_documents_cgu_agents_immo.sql`

---

## Hors scope v1

- Barème détaillé des réductions de commission
- Politique de Confidentialité complète
- Version PDF téléchargeable
- Vérification automatique validité carte T (API CCI)
