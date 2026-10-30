# Séparation du réseau réel et des démonstrations — 30 octobre 2026

## Résultat

Les vues des vrais membres excluent `is_demo=true` à chaque niveau, sans modifier les parrainages ni supprimer des comptes. Les valeurs historiques nulles restent considérées comme réelles. Le compte Apple Review identifié par son UUID est corrigé en démonstration ; son accès Auth, son état actif et son réseau sont conservés.

Les comptes de démonstration voient uniquement leur propre espace (`demo_owner_id`, ou leur propre UUID pour la racine). Les vrais comptes ne peuvent pas rouvrir une branche cachée par un lien direct d’arbre, d’enfants, d’événements ou de fiche filleul.

## Consommateurs

Le helper `src/lib/network-visibility.ts` est partagé par la page réseau, les statistiques, le tableau de bord, la liste détaillée et les API réseau. Les comptes de filleuls, le détail de chaque membre et les montants de démonstration respectent le même périmètre. L’aperçu du tableau de bord reste limité à trois noms mais son compteur direct utilise le total exact, pas la taille de l’aperçu.

La nouvelle RPC `get_display_network_ids` fournit la projection d’affichage sur cinq niveaux, protège les cycles et n’autorise que le propriétaire, le super administrateur ou le service serveur. `get_network_ids` reste inchangée pour les usages financiers et historiques. Les classements publics de parrainage, taille de réseau, recommandations et revenus excluent aussi les comptes/données de démonstration.

Le compteur du précédent écran natif est aligné sur la nouvelle RPC. L’entrée actuelle des applications natives utilise les écrans web ; cette livraison vise main/dev2 et ne soumet pas de nouvelle version aux stores.

## Livraison

Appliquer `supabase/migrations/20261030f_real_and_demo_networks.sql` avant le déploiement du code qui consomme la nouvelle RPC. Migration transactionnelle et répétable ; aucune suppression. Recharger le schéma PostgREST après création de la fonction. Livrer le même commit sur main et dev2, garder l’auto-déploiement, puis vérifier les deux images actives et les parcours réels.

Préflight production annulé après lecture : le réseau du parrain du compte Apple passe de 132 membres mélangés sur cinq niveaux à 7 vrais membres, tous directs ; Apple garde 8 directs et 66 membres de démonstration. Aucun autre membre réel n’est perdu. Ces nombres sont un relevé daté et peuvent évoluer avec les inscriptions.

## Tests

- `node --test tests/unit/network-visibility.test.cjs tests/unit/national-feed.test.cjs tests/unit/activity-presentation.test.cjs` : filtrage réel/démo, compteurs, branches, protection des accès, erreurs de profil, et régressions du fil.
- `node --test tests/regression/network-sponsor.cjs tests/regression/profile-invitation.cjs` : identité du parrain, invitation et partage.
- `tests/integration/real-and-demo-networks.sql` dans un PostgreSQL temporaire vide : répétabilité, absence de suppression, espaces séparés, droits, profondeur, cycles et classements sans démo.
- TypeScript web/mobile et build web.
- Navigateur sur main et dev2 : arbre, listes, compteurs du réseau/tableau de bord/statistiques, rechargement et conservation du réseau Apple. Les sessions de recette sont isolées et nettoyées sans déconnexion des sessions existantes, sans email ni changement de mot de passe.
