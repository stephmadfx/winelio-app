# Winelio — correction géolocalisation Android

Dernière vérification : 22 octobre 2026.

## Contexte

La version Android 1.0.1 (10), avec la récupération du parrainage après installation, était disponible en production Google Play le 22 octobre à 16 h 12. Elle déclarait seulement `ACCESS_COARSE_LOCATION`, alors que la WebView 13.15.0 demandait et exigeait `ACCESS_FINE_LOCATION`.

## Correction

- Conservation des ajouts de parrainage du build 10 ; passage Android au build 11, version 1.0.1.
- Déclaration des deux permissions dans `mobile/app.json`.
- Patch pnpm Android de la WebView : demande des deux permissions ensemble, acceptation de la précision choisie, réponse unique au callback après traitement des résultats. Les permissions caméra/audio conservent leur traitement.
- Compilation locale Gradle avec le script existant et vérification du certificat de publication. Aucun build iPhone ni déploiement web effectué pour ce correctif.

## Vérifications

- `python3 tests/regression/android-location-permissions.py` : exécution des vrais gestionnaires Java extraits de la dépendance installée, avec stubs Android ; autorisations existantes, nouvelles demandes, résultats mixtes, refus, caméra et file d'attente.
- 10 tests de parrainage/inscription et 9 tests de navigation/chargement mobile réussis ; TypeScript mobile et `git diff --check` réussis.
- AAB signé : `outputs/google-play/geolocation-build-11/winelio-1.0.1-11-geolocation.aab`.
- SHA-256 : `605ef6c9caaeb8ac23b78bccd204a8fe48debc12cffa8c695e5f28bef4404c3a`.
- Les deux permissions sont présentes dans l'AAB compilé.
- Comparaison binaire des assets : `base/assets/index.android.bundle` est strictement identique entre les builds 10 et 11 (SHA-256 `72cee80e86271552f1a691f692e9023cdb647f222c452982de4b66c2e5850112`). Le JavaScript du parrainage est donc conservé sans modification.
- Tests sur émulateur Android API 36, avec un APK extrait de cet AAB et signé pour les tests. Instrumentation exécutant `navigator.geolocation.getCurrentPosition` dans la véritable WebView, avec les options du parcours de recommandation : première autorisation approximative, autorisations approximative et précise conservées après relance, refus avec code 1. Tous ces cas passent.
- Des positions synthétiques réseau/fused/GPS sont nécessaires à l'émulateur ; sans elles, les premières acquisitions ont expiré avec code 3. Aucun téléphone réel ni parcours authentifié de recommandation testé.
- Aucun compte ni donnée serveur de test créé. Instrumentation et fournisseurs de position simulée supprimés, permission de simulation rétablie et émulateur arrêté.

## Soumission et reprise

Build 11 importé dans la release Google Play 6. Un seul avertissement non bloquant : absence de fichier de désobscurcissement, alors que la minification est désactivée. Aucun appareil supplémentaire exclu. Après clarification explicite de l'utilisateur, la publication gérée est désactivée : les mises à jour doivent être diffusées automatiquement dès l'approbation de Google. Ce réglage a été vérifié après rechargement de la console. Capture : `outputs/google-play/geolocation-build-11/google-play-automatic-publication.jpg`.

La déclaration Google Play « Sécurité des données » ne couvrait que la position approximative. La position exacte a été ajoutée : collectée, non partagée, facultative, traitée de manière éphémère, pour le fonctionnement de l'application. La route `/api/professionals/search` et la fonction SQL de recherche utilisent les coordonnées pour calculer les distances, sans écriture de la position du membre dans ce parcours. La console a confirmé l'enregistrement de cette modification pour examen avec le binaire.

Console : https://play.google.com/console/u/0/developers/6645855122676552974/app/4976328415040786163/publishing

Après les contrôles rapides, les premières confirmations d'envoi revenaient à « Modifications pas encore envoyées pour examen », avec une erreur Google intermittente `4165B974`. Le blocage a ensuite disparu. L'historique confirmait l'**envoi 10**, daté du 22 octobre 2026 à 18 h 43 dans la console, pour Production et Contenu de l'application.

Contrôle du 22 octobre 2026 à 19 h 20, heure de Paris : le build exact **11 (1.0.1)** est **Disponible sur Google Play**, canal **Production**, **déployé à 100 %**, dans les 2 pays/régions ciblés. La console donne une date de sortie au **22 octobre à 18 h 55** et place le build 10 dans les bundles désactivés. La fiche publique est accessible avec le bouton Installer, une mise à jour datée du 22 octobre et les nouvelles notes sur la correction de géolocalisation et le maintien du parrainage. Approbation et diffusion du build 11 sont donc confirmées ; l'installation et le résultat sur le téléphone de Thierry ne sont pas vérifiés.

Reçu : https://play.google.com/console/u/0/developers/6645855122676552974/app/4976328415040786163/publishing/submission-activity/10/details

Preuves : `outputs/google-play/geolocation-build-11/google-play-production-100.jpg` pour la diffusion finale ; `google-play-in-review.jpg` et `google-play-submission-10.jpg` dans le même dossier pour la soumission.

Le suivi automatique `surveiller-la-diffusion-android-winelio-1-0-1-11` a été supprimé après ce contrôle concluant pour éviter les notifications répétées. Aucun message n'a été envoyé à Thierry.

À reprendre : effectuer un essai après mise à jour sur le téléphone de Thierry. Aucun push des commits locaux ni déploiement web n'a été effectué dans cette intervention Android.

## Consolidation Git — 22 octobre 2026

Les sept commits Android, de `3f27dbdd` à `77c5371f`, sont conservés sans réécriture dans la fusion main `33044703`. Le bundle externe `../backups/consolidation-2026-10-22/local-commits.bundle` et la branche `codex/backup-before-consolidation-20261022` conservent aussi l’état antérieur. Cette consolidation sauvegarde le source du build 11 ; elle ne crée ni nouveau binaire natif ni nouvelle soumission Google Play.

Le test Java des permissions Android, les 9 tests de navigation/chargement WebView et TypeScript mobile ont été rejoués avec succès. Les tests navigateur de recherche de ville passent également en web, Android simulé et iPhone simulé. Ils ne remplacent pas un essai physique sur le téléphone de Thierry.
