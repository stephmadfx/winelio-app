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
- Tests sur émulateur Android API 36, avec un APK extrait de cet AAB et signé pour les tests. Instrumentation exécutant `navigator.geolocation.getCurrentPosition` dans la véritable WebView, avec les options du parcours de recommandation : première autorisation approximative, autorisations approximative et précise conservées après relance, refus avec code 1. Tous ces cas passent.
- Des positions synthétiques réseau/fused/GPS sont nécessaires à l'émulateur ; sans elles, les premières acquisitions ont expiré avec code 3. Aucun téléphone réel ni parcours authentifié de recommandation testé.
- Aucun compte ni donnée serveur de test créé. Instrumentation et fournisseurs de position simulée supprimés, permission de simulation rétablie et émulateur arrêté.

## Soumission et reprise

Build 11 importé dans la release Google Play 6. Un seul avertissement non bloquant : absence de fichier de désobscurcissement, alors que la minification est désactivée. Aucun appareil supplémentaire exclu. Publication gérée activée pour limiter la demande à la soumission : la diffusion doit être déclenchée manuellement après approbation.

Console : https://play.google.com/console/u/0/developers/6645855122676552974/app/4976328415040786163/publishing

À reprendre : contrôler l'état final d'examen, puis effectuer un essai après installation sur le téléphone de Thierry. L'approbation de Google et la diffusion ne sont pas prouvées par l'importation du binaire.
