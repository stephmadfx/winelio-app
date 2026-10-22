# Winelio — point de consolidation du 22 octobre 2026

Vérification : 22 octobre 2026, vers 21 h 48, Europe/Paris. Périmètre : modifications Winelio du jour retrouvées dans les conversations, Git local/distant, Coolify, Supabase et consoles Apple/Google. Audit sans fusion, push, modification de base, envoi d'e-mail ou nouvelle soumission aux stores. Ce fichier est le seul ajout de cet audit.

## Résultat

Les principales évolutions web et métier sont intégrées dans les deux branches distantes et leurs migrations sont actives. En revanche, le dépôt de travail local n'est pas consolidé : sept commits Android restent locaux, l'écran réseau contient un brouillon et le parcours web d'installation par parrainage reste volontairement isolé. Le correctif du live est maintenant déployé sur main et dev2 ; le contrôle complémentaire ci-dessous confirme le rendu en production.

Consigne utilisateur retrouvée pendant l'audit : **main est désormais la référence de travail ; dev2 reste en secours**. La demande en cours pour le correctif du live autorise explicitement ses deux déploiements.

## Livraisons retrouvées

| Sujet | Git | État vérifié |
| --- | --- | --- |
| Inscription avec code parrain obligatoire | `2c111cc5`, inclus dans main et dev2 | Déployé. Le trigger `enforce_new_profile_sponsor_trigger` est activé en base. Tests de refus du code absent/invalide et contrôle serveur présents. |
| Ordre professionnel → besoin → contact | `b69147ee`, inclus dans les deux branches | Déployé. La conversation dédiée rapporte le parcours contrôlé en production, sans recommandation ni e-mail envoyé. |
| Suppression du cashback/Wins et maintien du bonus d'affiliation | `d93239ae`, inclus dans les deux branches | Déployé et migration active : 60 % au recommandeur, cinq fois 3 %, 1 % au parrain du professionnel, 24 % Winelio ; les deux taux cashback valent zéro. Documents légaux en version 2026-10-22. |
| Consignes projet et compilations mobiles locales | `63ab9f0e`, `7540541c` | Intégrés dans les deux branches. Aucun nouveau build distant lancé pendant cet audit. |
| Module natif de reprise du parrainage | `f3877491` | Intégré et présent dans les binaires locaux envoyés. La première installation réelle avec récupération de l'invitation reste à vérifier. |
| Recherche ville/code postal | `7c7a5743` | Intégrée et déployée sur les deux sites. Les fichiers locaux modifiés correspondent exactement aux fichiers distants : ce sont des copies déjà livrées, pas une évolution oubliée. L'autre conversation rapporte aussi des essais sur Android et iPhone physiques. |
| Sauvegarde du profil après erreur 504 | `b8eee41a` | Déployée sur les deux environnements ; parcours 504, reprise et persistance contrôlés dans le navigateur lors de l'intervention précédente. L'origine exacte du timeout historique n'est pas établie. |
| « Voir tout le live » | `92c552d6` | Poussé sur main et dev2 pendant l'audit. Au dernier contrôle : déploiement main en cours et dev2 en file ; les conteneurs actifs servent encore `b8eee41a`. Vérification finale portée par l'autre conversation. |
| Comptabilité et réservations de retrait du 21 octobre | `75475b75`, `99f42093` | Les deux commits sont bien ancêtres de la version distante actuelle ; ils n'ont pas été perdus lors des évolutions du jour. Pas de nouveau paiement ni retrait exécuté pour cet audit. |

## Mobile et parrainage après installation

**Google Play :** consultation directe de la release 6 : Winelio **1.0.1 (11)**, disponible en Production, **100 %**, sortie indiquée le 22 octobre à 18 h 55. Le build 10 figure parmi les bundles désactivés.

**Apple :** consultation directe de la soumission `ee8b19b1-6dd4-4179-9131-0aa8218cfb1a` : **1.0.1 (8), Waiting for Review**, soumise à 15 h 54. La version 1.0 reste indiquée Ready for Distribution. L'envoi est donc bien reçu ; la nouvelle version n'est pas encore publiée.

Les empreintes des AAB 10, AAB 11 et IPA 8 locaux correspondent aux rapports d'envoi conservés. Cela vérifie les fichiers conservés, sans remplacer un téléchargement et une installation depuis chaque store.

Le commit **`feb0b8c8`**, branche `codex/referral-web-rollout`, reste à part dans `/Users/steph/.codex/worktrees/referral-web-rollout/winelio`. Ses cinq fichiers ajoutent les boutons d'installation et la reprise du parrainage sur le site. Cette absence de fusion est **volontaire** : attendre la disponibilité des deux versions natives et la reprise demandée par l'utilisateur. Le worktree ne présente pas de modification suivie non commitée.

Le fichier `output/referral-install/release/status.json` conserve encore le premier état Android, build 10 en examen. Il est ancien par rapport à la console actuelle et ne doit pas être utilisé comme preuve du statut présent. Le suivi Android plus récent est `doc/android-geolocation-2026-10-22.md`.

## État local à consolider

1. **Sept commits Android non poussés**, de `3f27dbdd` à `77c5371f` : correctif de permissions précise/approximative, patch WebView pnpm, versionCode 11, test et documentation de soumission/diffusion. Le build 11 est publié, mais son source n'est pas encore sauvegardé sur les branches GitHub. Le rapport Android le précise explicitement.
2. Le correctif profil local **`bce0fd44`** est l'équivalent de **`b8eee41a`** distant. Le compteur ahead/behind ne signifie pas que ce correctif manque sur GitHub.
3. Les fichiers locaux `StepProfessional.tsx` et `GeoStatusBanner.tsx` sont identiques à ceux de la branche distante, mais restent non commités par rapport au HEAD local. La recherche par ville n'est donc pas perdue.
4. `src/app/(protected)/network/page.tsx` contient un **brouillon non commité** : distinction du code d'invitation personnel et du parrain effectif. Son test `tests/regression/network-sponsor.cjs` est également non suivi. Trois tests passent ; ce changement n'est pas livré.
5. `src/components/activity-feed.tsx` et son test sont manipulés dans l'autre conversation. Ne pas les intégrer de nouveau sans comparer au commit `92c552d6`.
6. Les nombreux fichiers non suivis comprennent captures, vidéos, présentations, exports et résultats de tests, mais aussi `pnpm-lock.yaml` et `pnpm-workspace.yaml` à la racine. Ils ne doivent pas tous être ajoutés à Git en bloc. Aucune suppression effectuée.
7. Trois anciens stashes d'avril/mai et plusieurs anciennes branches locales subsistent. Ils ne sont pas une preuve de changements manquants du 22 octobre et n'ont pas été appliqués.

## Vérifications de cet audit

- 36 tests de régression sur la version isolée `b8eee41a` : inscription, affiliation, reprise du parrainage, profil, invitations, contacts et recherche par ville.
- 9 tests de navigation/chargement WebView iPhone et Android.
- Test Java des gestionnaires de permissions Android installés : permissions existantes et nouvelles, approximative/précise, refus, callback unique, caméra et file d'attente.
- 3 tests du brouillon local d'affichage du parrain sur l'écran réseau.
- `git diff --check` réussi.
- Vérification en lecture seule des pourcentages et du trigger dans la base active.
- Concordance des empreintes des binaires locaux avec les rapports d'envoi.
- Statuts Google Play et App Store Connect relus directement.

Les builds et essais UI du profil et de la recherche ont été effectués dans leurs interventions respectives. Aucun nouveau build natif ni essai physique de première installation depuis un store n'a été effectué ici. Les 36 tests ne constituent pas une validation du nouveau correctif live `92c552d6`, livré après le lancement de cette suite.

## Ordre de reprise recommandé

1. Laisser terminer la livraison et les contrôles du live dans sa conversation.
2. Sauvegarder les modifications locales avec un manifeste, puis consolider la référence main : conserver les sept commits Android, reprendre les évolutions distantes de recherche/live et éviter le doublon du correctif profil. Ne pas faire de reset ou de pull aveugle sur la copie de travail actuelle.
3. Traiter séparément le brouillon réseau et les configurations non suivies ; ne pas confondre brouillon, copie déjà livrée et artefact de test.
4. Après validation Apple et reprise autorisée, intégrer le seul commit web `feb0b8c8`, vérifier les parcours et réaliser les premières installations depuis les stores avec une invitation.

La conversation ayant nettoyé AGENTS.md signale aussi d'anciens secrets dans l'historique Git. Leur présence et leur rotation n'ont pas été réauditées ici ; aucune valeur secrète n'a été recherchée ou recopiée pour ce bilan. La réception en boîte des messages éventuellement envoyés dans d'autres interventions n'est pas couverte par cet audit logiciel.

## Références

- [Release Android 1.0.1 (11)](https://play.google.com/console/u/0/developers/6645855122676552974/app/4976328415040786163/tracks/4697382647344347526/releases/6/details)
- [Soumission Apple 1.0.1 (8)](https://appstoreconnect.apple.com/apps/6792769653/distribution/reviewsubmissions/details/ee8b19b1-6dd4-4179-9131-0aa8218cfb1a)
- `doc/parrainage-installation-native.md`
- `doc/android-geolocation-2026-10-22.md`
- Conversations Winelio du 22 octobre, historique Git et statuts Coolify consultés pendant ce bilan.


## Contrôle complémentaire — production main, 22 octobre 2026

Ce contrôle remplace les états transitoires du live ci-dessus ; il ne constitue pas une nouvelle livraison ni une validation des stores.

- `git fetch` effectué ; `origin/main` et `origin/dev2` pointent vers `92c552d609e67669e62ad81e041e44ad5a64d212`.
- Déploiements Coolify `ewumzpewfcnj4pwr7vogoevk` (main) et `cfoh3yr18q0mwevnc4cm3j8o` (dev2) terminés. Les deux conteneurs actifs utilisent cette image.
- Comparaison du contenu : live, recherche de ville et formulaire de profil locaux identiques à main distant. Le correctif profil local `bce0fd44` est confirmé équivalent à `b8eee41a` par `git cherry`.
- 35 tests ciblés repassés sur la copie isolée du commit réellement déployé : parrain obligatoire, affiliation, entrées et reprise du parrainage, profil/invitations et contacts. Zéro échec ou test ignoré. Journal : `/tmp/winelio-global-regression.log`.
- Base active relue en lecture seule : recommandeur 60 %, niveaux 1–5 à 3 %, affiliation 1 %, plateforme 24 %, deux taux cashback à zéro ; trigger de parrainage obligatoire activé.
- Navigateur de production : dashboard et ouverture du live sans redirection ; recommandation avec ordre Professionnel → Besoin → Recommandé ; saisie Lyon, suggestions réelles, sélection et recherche des professionnels ; profil affiché ; portefeuille affiché sans onglet Wins ; écran Réseau affichant encore « Mon code parrain », ce qui confirme l’absence du brouillon « Mon code d’invitation / Votre parrain ».
- Aucune modification de profil, création de recommandation, inscription, opération financière, émission d’email ou donnée temporaire en base pendant ce contrôle.

**Conclusion : les principales évolutions web livrées sont confirmées en production ; “tout le travail du jour est sur main” est faux.** Restent le brouillon Réseau, sept commits Android locaux et le commit de parrainage web `feb0b8c8` volontairement isolé. Les artefacts et captures non suivis ne sont pas assimilés à des évolutions à déployer.

Limites : pas de nouvelle sauvegarde de profil ni transaction financière réelle, pas de première installation native, pas de nouvelle consultation des consoles Apple/Google, pas de test du clic live derrière le verrou dev2. Les builds et contrôles mobiles antérieurs restent datés de leurs interventions respectives. Les analyses Sentry du dashboard et du portefeuille ne représentent pas de nouveaux correctifs déployés ; le diagnostic dashboard retrouvé dans le chat dédié identifie une extension Chrome et rapporte zéro modification de Winelio.

## Consolidation autorisée — 22 octobre 2026

À la demande explicite de l’utilisateur, main devient la référence consolidée. Les constats précédents décrivent l’état avant cette intervention.

- Sauvegarde externe : `../backups/consolidation-2026-10-22/`, bundle des huit commits locaux vérifié, copie de 17 fichiers avec empreintes SHA-256 et inventaire Git. Les captures, exports et autres fichiers non suivis restent en place.
- Référence de secours : `codex/backup-before-consolidation-20261022`. Le stash `consolidation-20261022-tracked-backup` reste conservé ; ses fichiers source sont déjà identiques au résultat fusionné et les quatre fichiers Finder ont été rétablis.
- Fusion de origin/main dans main local, sans réécriture de l’historique : les sept commits Android originaux sont conservés, ainsi que les correctifs de profil, recherche et live déjà publiés.
- Correction Réseau : « Mon code d’invitation » désigne le code à partager ; « Votre parrain » montre le parrain effectivement rattaché, avec les cas fondateur, parrain absent et informations indisponibles.
- `AGENTS.md` indique main comme branche de référence. Les fichiers pnpm non suivis à la racine sont conservés sans être intégrés ; le patch Android et sa configuration pnpm sont bien suivis dans mobile/.
- Le commit web `feb0b8c8` reste uniquement dans sa branche/worktree différé. Aucune publication de cette évolution ni nouvelle soumission aux stores n’est comprise dans cette consolidation.

Vérifications de consolidation : 38 tests web ciblés, 9 tests de navigation mobile, test Java des permissions Android, TypeScript mobile et recherche de ville dans les navigateurs de test web/Android/iPhone réussis. Les résultats finaux du build et de la livraison sont consignés dans le reçu local de livraison, après leur vérification.
