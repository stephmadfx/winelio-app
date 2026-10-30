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
