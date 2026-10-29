# Winelio — partage natif Android

Dernière vérification : 29 octobre 2026.

## Contexte et cause

La production Google Play était en version 1.0.1 (11), diffusée à 100 %. Les boutons vidéo et invitation utilisent `navigator.share`. La WebView Android ne fournit pas cette API et le message `share` déclaré dans le pont n'était pas traité côté React Native.

Le script injecté contenait aussi un `\n` non échappé dans une chaîne du script généré, provoquant une erreur de syntaxe. Une fois cette erreur corrigée, le test Samsung a révélé une seconde cause : l'injection peut précéder la création de `document.documentElement`. L'ajout du style interrompait alors l'initialisation, avec un marqueur natif déjà posé. L'émulateur, où le document existait au même stade, ne reproduisait pas ce défaut.

## Correction

- Installation de `navigator.share` dans l'application Android, reliée à `Share.share` de React Native, pour tous les boutons web existants.
- Conservation du titre, du texte, des liens et du code parrain ; une URL déjà incluse dans le message n'est pas dupliquée.
- Promesse avec identifiant de requête, retour natif, distinction annulation/erreur, validation du message et contrôle de l'origine Winelio.
- Initialisation tolérant l'absence de racine HTML ; marqueur posé après initialisation et seconde injection au chargement. Les appels iOS à une API Web Share déjà disponible sont conservés.
- Aucun SDK, permission ou destinataire ajouté. Il s'agit du partage de liens et de textes ; aucun envoi à un tiers n'est automatique. Android confirme l'ouverture du menu, pas la réception d'un message.

## Processus reproductible

1. Exécuter `node --test tests/regression/native-share.cjs` et les régressions de parrainage/navigation ; contrôler TypeScript mobile.
2. Compiler le site avec `npm run build` avant le push.
3. Générer le projet Android local si absent, avec les dépendances propres au worktree : `expo prebuild --platform android --no-install`.
4. Compiler l'AAB local par `python3 mobile/scripts/build-android-release.py` ; ce script utilise le trousseau et compare le certificat de publication sans afficher les secrets.
5. Extraire un APK universel du même AAB pour les tests. Utiliser la signature de test déjà installée pour conserver la session du téléphone ; ne pas désinstaller l'application.
6. Vérifier le vrai bouton vidéo et le partage d'invitation sur Samsung, l'annulation et la reprise ; contrôler aussi l'émulateur. Ne pas envoyer de message externe pour ces essais.
7. Pousser atomiquement les mêmes changements sur `main` et `dev2`, conserver l'autodéploiement, vérifier les deux commits déployés.
8. Importer le bundle final Google Play puis envoyer la release Production à l'examen ; distinguer import, examen et disponibilité publique.

## Artefact final

Android 1.0.1 (13), AAB local signé : `output/android-share-20261029/Winelio-Android-1.0.1-13.aab`.

SHA-256 : `d384a1e71fef4901b82bcb8041c00276c9837f6bb9c3b4533d9e6bef94362935`.

Le code 12 a été importé en brouillon, puis écarté après le test Samsung. Il ne doit pas être diffusé.

## Vérifications techniques

- 21 tests partage/parrainage/invitation, 9 tests navigation/chargement mobile, test Java des permissions géographiques : réussis.
- TypeScript mobile, build Next et build Gradle du bundle 13 : réussis ; certificat AAB vérifié.
- Un test préexistant de `required-sponsor.cjs` reste en échec : son banc de test ne fournit pas le mock `@/lib/notify-new-referral` introduit par la modification précédente du projet ; les cinq autres scénarios de ce fichier passent. Aucun changement de l'inscription dans ce correctif.
- Aucun compte de test, aucune écriture métier ni aucun email créé par les essais.
