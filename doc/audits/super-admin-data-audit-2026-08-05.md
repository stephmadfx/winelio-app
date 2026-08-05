# Audit des chiffres Super Admin Winelio

Snapshot de production : **5 août 2026 à 11 h 59 (Europe/Paris)**. Périmètre : `/gestion-reseau` uniquement. Toutes les vérifications de base ont été exécutées en lecture seule.

## Executive Summary

- **Les chiffres Super Admin ne représentent pas le réseau réel.** Le filtre `*_real` exclut les comptes E2E et les profils de scraping, mais pas les données `is_demo`. Le tableau de bord affiche donc 115 membres actifs au lieu de 49 comptes Auth actifs non-démo, et 37 recommandations au lieu d'une seule recommandation réelle.
- **Tous les montants de commission actuellement affichés sont issus de la démo.** Les 226,40 € marqués « distribués » et les 1 154,80 € « en attente » correspondent à 26 transactions, toutes `is_demo=true`. Il n'existe encore aucune transaction de commission réelle.
- **Le futur flux de commissions réel est à risque critique.** Le profil système `00000000-0000-0000-0000-000000000001`, bénéficiaire obligatoire de la cagnotte, est absent de production. L'insertion groupée ne contrôle pas son erreur. Une future ventilation peut donc échouer silencieusement.
- **Les pages Réseau, Recommandations et Professionnels mélangent également plusieurs grains.** La page Réseau compte les profils démo; la page Recommandations interroge la table brute; la page Professionnels inclut des entreprises supprimées et fabrique une fausse date de dernière connexion lorsqu'aucune connexion Auth n'existe.

## Chiffres affichés contre réalité vérifiable

| Indicateur | Affiché / calcul actuel | Réalité non-démo vérifiée | Diagnostic |
|---|---:|---:|---|
| Membres actifs | 115 | 49 | 66 profils démo inclus |
| Recommandations totales | 37 | 1 | 36 recommandations démo incluses |
| Recommandations en cours | 32 | 1 | 31 recommandations démo incluses |
| Recommandations terminées | 5 | 0 | taux de conversion actuel 5/37 = 14 %, mais 100 % démo |
| Commissions distribuées | 226,40 € | 0 € | toutes les transactions EARNED sont démo |
| Commissions en attente | 1 154,80 € | 0 € | toutes les transactions PENDING sont démo |
| Cagnotte Winelio | 0 € | non calculable de façon fiable | aucun profil système ni transaction `platform_winelio` |
| Wins distribués | 0 | 0 | cohérent à date |
| Retraits en attente | 0 | 0 | cohérent à date |
| Professionnels listés | 27 | 24 entreprises owner non supprimées | 3 entreprises supprimées restent affichées |

Le dénominateur « membres réels » est défini ici comme un profil actif, non-démo, non-E2E, rattaché à `auth.users`. Cette définition correspond à un compte Winelio effectivement créé; elle doit être validée comme définition métier officielle.

## Les vues `*_real` portent un nom trompeur

**Gravité : haute — confiance : élevée.** Les vues filtrent seulement les emails `@winelio-e2e.local` et `@winelio-scraped.local`. Elles ne filtrent jamais `is_demo=false`. Cela explique directement les 66 profils démo, 36 recommandations démo et 26 commissions démo visibles dans les KPI.

Impact : dashboard, graphiques mensuels, taux de conversion, pages Utilisateurs et Professionnels. Les valeurs sont techniquement cohérentes avec les vues, mais les vues ne correspondent pas au sens métier de « réel ».

## Le système de commission est incomplet en production

**Gravité : critique — confiance : élevée sur le risque, moyenne sur l'impact historique réel.** Le plan actif prévoit 60 % recommandeur, cinq niveaux à 3 %, 1 % affiliation, 1 % cashback et 23 % plateforme. Or :

- le profil système Winelio requis par `createCommissions()` est absent;
- il n'existe aucune transaction `platform_winelio`, `professional_cashback`, `affiliation_bonus`, ni de niveaux 3 à 5;
- les 13 recommandations démo aux statuts `QUOTE_VALIDATED` ou `COMPLETED` n'ont aucune commission directe, plateforme ou cashback conforme au plan;
- l'appel d'insertion ignore l'objet `error` renvoyé par Supabase;
- aucune session Stripe payée n'existe encore, donc aucun paiement réel ne permet de prouver que ce chemin a fonctionné en production.

La conclusion prudente est : les chiffres historiques sont de la simulation, et le premier vrai paiement court un risque élevé d'échec silencieux de toute la ventilation.

## Le réseau par Super Admin mélange réel et démo

**Gravité : haute — confiance : élevée.** Trois racines Super Admin existent. À cinq niveaux, les tailles calculées sont 30, 67 et 8 descendants. La racine à 67 descendants contient 59 profils démo et seulement 8 profils non-démo. Les deux autres racines contiennent respectivement 30 et 8 profils non-démo.

Les requêtes de la page Réseau utilisent directement `profiles` et `commission_transactions`, sans filtre réel/démo et sans filtre de statut pour les montants. Une commission PENDING est ainsi additionnée comme si elle était gagnée.

## La page Professionnels présente de l'activité fictive

**Gravité : haute — confiance : élevée.** Sur 24 entreprises owner non supprimées, seules 6 sont reliées à un compte Auth; 18 ne le sont pas. Pour toute entreprise sans vraie date de connexion, la page génère une date pseudo-aléatoire comprise entre 1 jour et 6 mois, l'affiche comme dernière activité et trie la liste dessus.

La page se décrit comme l'« annuaire complet des entreprises inscrites », alors qu'elle mélange comptes inscrits, enregistrements sans compte Auth et 3 entreprises supprimées.

## Contrôles qui passent

- aucune clé parrain orpheline;
- aucune recommandation sans référent;
- aucun wallet sans profil;
- les caches wallet correspondent exactement aux transactions présentes;
- zéro retrait en attente dans la table brute et dans la vue filtrée.

Ces contrôles montrent que le problème principal n'est pas une corruption relationnelle : c'est un problème de définition de périmètre, de données démo exposées et de flux financier incomplet.

## Correctifs recommandés

1. **Bloquer la confiance dans les KPI financiers actuels** jusqu'à correction; afficher temporairement un badge « données démo incluses » si le dashboard reste accessible.
2. **Créer une source de vérité Super Admin unique**, idéalement des vues ou RPC dédiées qui exposent explicitement `scope = real|demo|all`, avec `real` par défaut.
3. **Filtrer `is_demo=false` partout** : dashboard, graphiques, Utilisateurs, Recommandations, Réseau, commissions et compteurs par statut.
4. **Réparer le flux financier avant le premier paiement réel** : appliquer/vérifier la migration du profil système, faire échouer `createCommissions()` si l'insertion échoue, et ajouter un test transactionnel complet de la ventilation à 100 %.
5. **Séparer les professionnels** en comptes revendiqués/inscrits, préinscriptions et entreprises supprimées; ne jamais inventer de date d'activité.
6. **Recalculer les KPI par statut financier** : PENDING, EARNED et retiré doivent rester distincts; les pages Réseau ne doivent pas sommer tous les statuts.
7. **Ajouter des tests automatiques** : exclusion démo, somme de ventilation = commission de base, présence du profil système, unicité par recommandation/type/niveau/utilisateur, cohérence wallet et absence de dates fictives.

## Questions à trancher avant correction fonctionnelle

- Un « membre réel » signifie-t-il tout compte Auth actif, ou seulement un compte ayant terminé l'onboarding ?
- Une entreprise owner sans compte Auth doit-elle apparaître comme « préinscrite » ou être exclue de la page Professionnels ?
- Le taux de conversion doit-il être `COMPLETED / toutes les recommandations`, ou seulement sur une cohorte arrivée à maturité (hors PENDING récent) ?

## Sources et hypothèses

- Code Super Admin et migrations du dépôt, branche de travail actuelle.
- Schéma et agrégats de la base Supabase de production, interrogés en lecture seule.
- Requêtes reproductibles : `doc/audits/super-admin-data-audit-2026-08-05.sql`.
- Aucun compte ni aucune donnée de test n'a été créé pendant l'audit.
