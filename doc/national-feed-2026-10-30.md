# Fil national et résumés dans l’application — 30 octobre 2026

## Demande et décisions

Fil du tableau de bord visible par tous les membres authentifiés, indépendamment de leur réseau de parrainage. Quatre événements : arrivée, parrainage (identité du parrain uniquement), recommandation créée, commission directe effectivement créditée. Aucun montant de dossier, donnée client, ville ni coordonnée. Prénom + initiale ; ce format reste une donnée personnelle.

Le choix du demandeur est **résumé visible dans l’application**, sans push ni email. Le réglage offre 0, 1 ou 2 résumés/jour maximum. Désactivé par défaut ; distinct de la publication de son activité et de ses gains. Pour deux résumés : avant/après 14 h Europe/Paris. Génération à l’ouverture/refocus, uniquement avec de nouvelles actualités dans les dernières 24 h. Une seule bannière visible ; fermeture persistée par compte. Le changement de fréquence ne contourne pas le plafond journalier.

## Matrice de vérification

| Demande | Consommateurs/états | Risques | Vérification |
|---|---|---|---|
| Fil national | Dashboard web et WebView iOS/Android ; vide/erreur/reprise | RLS, contacts/dossiers exposés | Projection SQL avec accès authentifié, fixture navigateur |
| Gains | Trigger INSERT/UPDATE commission | PENDING, cashback, montants devis, doublons | Uniquement type recommendation EARNED positif, consentement au moment du crédit et de lecture |
| Confidentialité | Paramètres, API, historique, effacement | Accord implicite, autres comptes, re-publication après retrait | Opt-in distinct, RPC atomique, RLS, suppression et tests PostgreSQL |
| Résumés | Bannière dashboard, paramètres, API | Fréquence, concurrence multi-appareils, désactivation | Verrou par préférence, reçu unique jour/créneau, fermeture persistée |
| Dates/lisibilité | Carte et dialogue mobile/desktop | Anciennes dates transformées en présent, texte tronqué | Dates sources conservées, texte sur plusieurs lignes, liste stable |

## Implémentation et limites

- Migration `supabase/migrations/20261030_national_activity_feed.sql` : préférences, preuve de consentement version 2026-10-30, événements minimaux, reçus de résumés, RPC et triggers. Aucun backfill des gains ni des dossiers historiques.
- Nouveau membre : publication de l’arrivée après opt-in, possible dans les 24 h suivant création du compte. Le parrain peut publier son propre parrainage si son accord est déjà actif ; aucune identité du filleul dans ce message.
- Retrait de consentement : purge des publications concernées ; elles ne reviennent pas lors d’un nouvel accord. Les autres appareils relisent le fil à leur retour et toutes les 30 s au premier plan. Une lecture en erreur efface l’ancienne projection affichée.
- Le fil affiche au plus 100 événements sur 30 jours, cinq dans la carte. Aucun recyclage d’événement ni abonnement aux tables privées.
- L’ancien composant `network-feed.tsx` est sans consommateur actuel ; il n’est pas activé par cette modification.
- Le plafond concerne les résumés du réseau dans l’application. Les messages transactionnels existants ne sont pas modifiés.
- La notice de confidentialité est complétée. Son identification administrative comporte déjà des informations « en attente de validation » ; cette livraison ne constitue pas une certification juridique globale.

## Livraison à effectuer

1. Revoir les changements dédiés ; préserver les modifications préexistantes de vidéos et de la page réseau.
2. Appliquer la migration sur la base ciblée et vérifier les colonnes existantes (`is_demo`, `onboarding_status`, `is_active`). Elle ne modifie aucun solde ni écriture historique.
3. Vérifier la tâche `winelio-feed-retention` lorsque pg_cron est disponible. Sinon, planifier quotidiennement `SELECT winelio.cleanup_feed_events()` avec le rôle serveur ; ne pas exposer cette fonction aux utilisateurs.
4. Rejouer le parcours authentifié contre le schéma migré, dont consentement/révocation et persistance sur deux appareils. Aucun compte réel n’a été créé pour les tests isolés.
5. Si un déploiement est demandé, compiler puis pousser les changements dédiés de manière synchrone sur main et dev2. Vérifier les deux déploiements Coolify et leurs parcours publics/authentifiés. Respecter le service déjà présent sur 3001 (MyPartyFeed) ; Winelio utilise 3015 dans cette session.

## Tests

- `node --test tests/unit/national-feed.test.cjs` : validations/API et projection sans données privées.
- `node tests/integration/national-feed.cjs` : vrai PostgreSQL temporaire, sans connexion de production. `PG_BIN` configurable ; par défaut Homebrew PostgreSQL 16. Cluster et données supprimés après scénario, succès ou échec.
- `npx tsc --noEmit` et `npm run build`.
- Contrôle UI sur fixture temporaire avec les vrais composants et réponses API simulées ; il ne remplace pas une validation authentifiée après migration.

Résultats vérifiés : 6 tests unitaires/API réussis, tests PostgreSQL réussis, contrôle UI réel 1280/390 px réussi (API simulées), build final réussi. Avertissements existants de bundling MJML/cosmiconfig ; aucune erreur de build. Les fixtures UI et le cluster PostgreSQL temporaire sont supprimés.

Contrôle renforcé pour l’instance Supabase partagée : `20261030b_feed_member_access.sql` réserve aussi la projection aux profils Winelio actifs. Une session authentifiée d’un autre projet et un profil désactivé ne donnent aucun accès au fil. Tests PostgreSQL dédiés réussis.

## Reprise historique demandée après livraison

Migration `20261030c_feed_history_summaries.sql` : instantané collectif sur les 30 jours complets précédant la migration, heure de Paris. Comptes actifs, confirmés, hors démo et hors système ; métriques publiées seulement à partir de cinq observations (choix de minimisation, sans valeur de seuil légal). Aucun nom, lien vers un compte, ville, dossier ni montant. Les recommandations trop peu nombreuses sont omises. Les consentements existants restent inchangés : aucun événement nominatif ni gain ancien n’est publié.

Les bilans ont leur période et date historiques, la mention « Bilan collectif · historique », la même durée d’affichage et de purge que le fil. Le digest ignore ces bilans : leur ajout ne crée pas une notification de nouvelle activité. Une étape de publication différée via `is_published` permet de n’activer les bilans qu’une fois les deux frontends compatibles déployés.

Tests dédiés dans `tests/integration/national-feed-history.sql` et test de projection du résumé. Préflight de production en transaction annulée avant application réelle. Voir `doc/chat-vps-capacity-2026-10-30.md` pour la demande distincte sur le dimensionnement de messagerie ; aucune messagerie n’est ajoutée par cette livraison.

## Correction demandée : historique événement par événement

Le demandeur a précisé que le bilan collectif ne correspondait pas à sa demande. Il est désactivé et remplacé par les arrivées, parrainages et recommandations passés, chacun avec son identifiant d’événement et sa date source, sans regrouper les personnes en un bilan.

Migration `20261030d_individual_feed_history.sql` : reprise des 30 jours complets précédents, sources réelles hors démo et comptes confirmés. Les événements rétrospectifs sont affichés sous « Un membre », sans nom, client, coordonnées ni gain. Un accord ultérieur ne révèle pas rétroactivement ces identités. Les refus explicites sont respectés ; le retrait d’accord supprime aussi les publications historiques concernées. Aucune commission ancienne n’est reprise. Les nouveaux événements conservent le fonctionnement consenti existant.

Publication des lignes historiques seulement après vérification des deux conteneurs sur le nouveau commit. Les événements historiques sont exclus des rappels de nouvelle activité, même s’ils sont récents. Le plafond de 100 événements et la purge à 30 jours restent actifs. Scénarios PostgreSQL dédiés dans `national-feed-individual-history.sql` : dates, événements séparés, consentement, absence de gain, coexistence avec le flux nouveau, retrait et nettoyage.

## Décision explicite : prénom et initiale par défaut

Le 30 octobre, le demandeur a confirmé : activité ordinaire nommée par défaut, possibilité de masquer son activité, gains toujours soumis à un accord distinct. Cette décision remplace le masquage systématique des événements historiques et l’ancien opt-in pour l’activité ordinaire.

Migration `20261030e_feed_default_display_names.sql` : projection prénom + initiale pour chaque événement (y compris historique), sauf masquage explicite. Aucun choix existant n’est réécrit ; aucune préférence ni preuve de consentement n’est fabriquée. L’absence de réglage signifie activité visible et gains privés. Paramètres et notice affichent cette distinction. Les choix ultérieurs sont audités avec la version `2026-10-30-default-activity`.

Les nouvelles inscriptions doivent être confirmées et leur profil actif avant capture : la confirmation Auth et la complétion du profil utilisent le même helper, avec déduplication sur le type/source. Les comptes d’autres projets de l’instance partagée ne créent aucun événement Winelio. Le masquage supprime les publications concernées ; la réactivation ne recrée pas les événements supprimés. Gains EARNED positifs et accord explicite restent nécessaires, et aucun gain historique n’est repris.

Validation : tests SQL dédiés `national-feed-default-names.sql` (noms historiques, refus, confirmation, absence de faux accord, gains/attente, retrait, déduplication, isolation), test API des valeurs par défaut et des choix existants, TypeScript et build. La migration de visibilité est appliquée après livraison des deux interfaces et de la notice cohérentes.

## Présentation mobile et écran complet — 30 octobre 2026

L’accueil mobile présente trois événements complets, sans zone de défilement interne ni cartes imbriquées. Le prénom et l’initiale restent fournis par la projection sécurisée existante ; les avatars affichent uniquement ces initiales. Les indicateurs personnels réels et le podium restent disponibles sous le fil et l’action de recommandation. Sur ordinateur, l’aperçu présente cinq événements.

Le bouton « Toute l’activité » ouvre `/activity`, protégé par les contrôles d’authentification et de complétion de profil habituels. La page classe les événements par jour civil Europe/Paris et propose Tous, Membres, Parrainages et Recos. Le filtre est conservé dans l’URL `?type=…` après rechargement. Le retour ramène à l’accueil ; Accueil reste sélectionné dans les navigations. Les engrenages ouvrent `/settings#activity-preferences`.

La source, les dates, la rétention de 30 jours, le plafond des 100 dernières actualités et les consentements ne changent pas. Aucun gain ancien ou en attente n’est créé. L’interface indique le plafond lorsqu’il est atteint. Le rafraîchissement reste toutes les 30 secondes, uniquement dans un onglet visible et pour l’aperçu correspondant à la largeur active ; les requêtes obsolètes sont annulées. Une erreur de lecture retire les anciennes lignes affichées et propose Réessayer. La page gère aussi l’absence globale d’actualités et les filtres vides.

Validation automatisée : `node --test tests/unit/activity-presentation.test.cjs tests/unit/national-feed.test.cjs` couvre le tri, les filtres, les jours et changements d’heure de Paris, les initiales, les centimes des gains, la navigation et les règles API de confidentialité. Compléter la recette avec accueil mobile, page complète, filtres et URL après rechargement, engrenage, retour, affichage ordinateur, vide et erreur/reprise. Aucun schéma de base de données ni service de messagerie n’est ajouté.
