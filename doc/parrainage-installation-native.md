# Winelio — parrainage après installation, sans service tiers

Dernière vérification : 22 octobre 2026.

## Contexte

Préparation locale du parcours de parrainage sur iPhone et Android. Aucun abonnement de liens différés, SDK marketing ou fingerprinting. La seule nouvelle dépendance externe est la bibliothèque officielle Google Play Install Referrer 2.2, dans le module Android local.

La nouvelle version native doit être disponible sur les deux stores avant de déployer les boutons du site. Une mise à jour JavaScript seule ne suffit pas : le nouveau module doit être compilé dans les binaires. La préparation initiale a été validée localement ; la livraison 1.0.1 est en cours sur demande du 22 octobre 2026. Voir le suivi de livraison ci-dessous.

## Processus

1. L'invitation existante arrive sur `/auth/login?mode=register&ref=…`, puis sur la vidéo si elle n'a pas déjà été regardée.
2. Après le seuil de visionnage existant, le site propose le store correspondant au téléphone, ainsi que l'ouverture d'une application déjà installée. L'inscription web reste disponible, notamment sur ordinateur et dans la WebView native.
3. Android : le bouton Google Play inclut un paramètre `referrer` encodé contenant uniquement le marqueur Winelio, le code, le type pro éventuel et l'état de visionnage. Au premier lancement, le module local lit cette valeur avec l'API officielle Google Play. Une erreur temporaire reste réessayable au lancement suivant ; aucun matching alternatif n'est tenté.
4. iPhone : le clic sur « Télécharger sur iPhone » copie un lien HTTPS Winelio avant d'ouvrir l'App Store. Un échec de copie conserve la page et affiche les moyens de reprise.
5. À la première ouverture sur iPhone, la détection de la présence d'une URL peut proposer « Coller mon invitation ». La lecture du presse-papiers exige ce geste explicite et reste soumise à l'autorisation système iOS. Un bouton permanent sur l'écran de connexion permet de réessayer. Aucun contenu du presse-papiers n'est envoyé à un serveur ni journalisé.
6. Le code récupéré rejoint la page d'inscription existante dans la WebView. La validation du parrain et l'attribution restent côté serveur. Aucune attribution n'est effectuée par le module natif.
7. Une invitation reçue par `winelio://invite?ref=…` est également prise en charge à froid et pendant l'exécution. Elle est prioritaire sur une réponse tardive de Google Play ou du presse-papiers.

## Décisions

- Contrat commun aux deux clients : `src/lib/referral-install.ts`. Les codes historiques à six caractères et les codes actuels à huit caractères sont acceptés, puis validés par le serveur existant.
- Les liens récupérés sont limités au domaine exact `winelio.app` et aux routes d'inscription prévues, ou au schéma exact `winelio://invite`. Les paramètres ambigus, domaines tiers, identifiants dans l'URL et destinations arbitraires sont rejetés. Les liens Google Play doivent porter le marqueur `winelio_invite=1`.
- Le paramètre `video=1` est un état d'interface transmis après visionnage : il permet d'éviter de regarder la vidéo une seconde fois dans la WebView. Il ne donne aucun droit, ne valide aucun parrain et ne remplace aucun contrôle serveur.
- Une invitation en attente est conservée localement pendant sept jours au maximum et supprimée lorsque le tableau de bord est atteint. Sur Android, le stockage est atomique et exclu d'Android Backup pour éviter de restaurer les marqueurs d'une ancienne installation.
- Aucun lien universel HTTPS n'est requis pour cette version : le bouton explicite « Ouvrir mon invitation » utilise le schéma Winelio déjà configuré. Le simple bouton « Ouvrir » du store ne transmet pas de nouveau lien sur iPhone ; il faut conserver le lien copié ou retoucher l'invitation après installation.
- Le refus du collage ne bloque pas la connexion. Le nouveau clic sur l'invitation et la saisie manuelle restent disponibles. Aucun repli vers une reconnaissance de l'appareil.

## Fichiers et configuration

- Site : `src/components/referral-app-install.tsx` et intégration dans `LandingHero.tsx`.
- Natif : `mobile/modules/winelio-referral/`, découvert automatiquement par Expo Autolinking.
- Parcours WebView : `useReferralEntry.ts`, `WinelioWebAppScreen.tsx`, `mobile/app/+native-intent.tsx`.
- Metro : dossier `src/lib` partagé ajouté à la surveillance via `mobile/metro.config.js`.
- Aucun nouvel identifiant, compte fournisseur, jeton ou secret à configurer.
- Le module iOS fournit un manifeste de confidentialité pour son usage local de UserDefaults ; aucune collecte déclarée par ce module.

## Vérifications reproductibles

```sh
node --test tests/regression/referral-install.cjs tests/regression/referral-entry.cjs
node --experimental-strip-types --test mobile/src/features/webapp/webAppNavigation.test.ts mobile/src/features/webapp/webAppLoadPolicy.test.ts
npm run build
```

Dans `mobile/` :

```sh
pnpm typecheck
pnpm exec expo export --platform ios --platform android
```

Les tests navigateur utilisent `http://127.0.0.1:43176`. Démarrer un serveur Next dédié à cette adresse puis exécuter :

```sh
npx playwright test --config playwright.referral.config.ts
```

Pour tester le code natif, reconstruire les applications ; Expo Go ne contient pas le module. Les dossiers natifs générés restent locaux : utiliser le processus Expo habituel et `pod install` après ajout du module. Sur Android, renseigner le SDK local via `ANDROID_HOME` si nécessaire.

| Contrôle | Résultat |
| --- | --- |
| Contrat des liens, validation et reprise native simulée | 11 tests réussis |
| Régressions de navigation WebView et chargement | 9 tests réussis |
| Interface navigateur mobile, copie réelle, refus de copie et préremplissage natif | 6 tests réussis |
| Build Next.js | Réussi ; avertissements MJML préexistants, contrôle TypeScript séparé |
| TypeScript web et mobile | Réussis |
| Export JavaScript iOS et Android | Réussi |
| Build Android complet avec le module local | Réussi |
| Build iPhone Release et interface sur simulateur iOS 18.6 | Réussis : collage, code affiché, relance et invitation à chaud |

Les tests n'envoient aucun email et ne créent aucun compte, profil ou wallet. Les codes utilisés sont des fixtures locales. Le passage App Store est intercepté dans le test navigateur pour éviter un appel extérieur ; la copie utilise réellement l'API presse-papiers du navigateur Chromium avec un agent utilisateur iPhone. Cela ne constitue pas un test du presse-papiers Safari sur un téléphone physique.

## À reprendre pour la livraison

- Publier la nouvelle application et le site, avec des numéros de versions adaptés aux versions déjà présentes sur les stores.
- Tester une vraie première installation depuis Google Play avec `referrer`, puis l'inscription complète avec un code valide et le nettoyage de toutes les données temporaires.
- Tester Safari → copie → App Store → installation → autorisation de collage sur iPhone physique, y compris refus puis reprise. Le presse-papiers peut être remplacé pendant l'installation ; dans ce cas, retoucher l'invitation.
- Les navigateurs intégrés à des messageries peuvent limiter le presse-papiers ou le schéma d'ouverture : le message de reprise et l'inscription web restent disponibles.

Références : [API Google officielle](https://developer.android.com/google/play/installreferrer/library), [modules locaux Expo](https://docs.expo.dev/workflow/customizing/), [UIPasteboard Apple](https://developer.apple.com/documentation/uikit/uipasteboard).

## Complément de validation iPhone

Le build Release pour simulateur arm64 a réussi avec le nouveau module. Le premier assemblage Debug complet avait échoué dans la configuration locale React Native précompilée (symboles C++ de débogage manquants). Un script CocoaPods généré a dû être corrigé localement pour citer le chemin contenant un espace ; ce réglage local n'est pas une modification des dépendances du projet.

Le scénario `mobile/.maestro/referral-install-ios.yaml` a réussi sur un simulateur dédié iOS 18.6 : lecture après le geste de collage, formulaire pro prérempli avec `ABC12345`, même code après arrêt/relance, puis réception de `DEF12345` à chaud après confirmation système d'ouverture. Les captures sont dans `output/referral-install/iphone-native-paste.png` et `iphone-native-warm-link.png`.

Le simulateur créé pour cette vérification a été supprimé après le test ; aucun compte de test ni donnée applicative de test n'a été créé sur Supabase. Les autres simulateurs et appareils n'ont pas été modifiés.

Le test a révélé puis permis de corriger une course entre l'injection JavaScript de la WebView et la lecture de l'état de visionnage : cet état accompagne maintenant l'URL de la page d'inscription et y est appliqué avant la vérification de la vidéo, uniquement dans l'application native. Le préremplissage réutilise le mécanisme web existant ; aucune seconde injection spécifique au parrainage n'est nécessaire.

Ces binaires de vérification utilisent l'URL du serveur de test local. Pour les stores, reconstruire avec l'URL publique habituelle. Le simulateur ne remplace pas la vérification d'une installation réelle depuis chaque store ni celle du dialogue de collage depuis Safari sur un iPhone physique.

## Livraison 1.0.1 — 22 octobre 2026

- Versions publiques contrôlées : iPhone 1.0 (API publique Apple), Android 0.2.2 (9), disponible à 100 % dans Google Play Console.
- Binaires demandés : Android 1.0.1 (10), iOS 1.0.1 (8). Signature existante conservée ; URL WebView explicitement fixée à `https://winelio.app` dans le profil EAS production.
- [Build Android](https://expo.dev/accounts/stephmadfx/projects/winelio/builds/3cbd9b3c-3e78-4ada-9838-458d2ec42f18) ; [build iOS](https://expo.dev/accounts/stephmadfx/projects/winelio/builds/3fc2f70d-468c-4402-a118-2573ba3df7ff). Ces builds ne prouvent ni soumission ni disponibilité publique.
- Les sources de livraison ont été isolées de la copie de travail partagée, à partir de `b69147ee`. Aucun autre changement en cours n'a été embarqué. Les archives excluent les fichiers locaux de configuration et les productions sans rapport avec le mobile.
- `.easignore` limite les prochains builds à `mobile/` et au seul contrat `src/lib/referral-install.ts`. Les exclusions natives de `mobile/.gitignore` sont ancrées à la racine pour conserver les sources du module local.
- Vérification de publication : build Next réussi, contrôles TypeScript web et mobile réussis, 20 tests de contrat/parcours natif/navigation réussis à nouveau. Les six tests navigateur et le scénario iPhone sur simulateur ont été validés pendant la préparation initiale.
- Appareils physiques détectés : Samsung Galaxy S10 par ADB et iPhone 15 Pro jumelé, sans Winelio installé sur ce dernier. Aucun de ces constats ne constitue une première installation via un store.

| Parcours | Consommateurs et états | Risque à contrôler | Preuve attendue |
| --- | --- | --- | --- |
| Invitation Android → Play → installation | Site, Play Install Referrer, module Kotlin, WebView ; premier lancement et relance | Mauvaise version installée, état restauré, référence absente | Installation par Play du nouveau code de version et code prérempli |
| Invitation Safari → copie → App Store → installation | Safari, presse-papiers, module Swift, WebView ; autorisation, refus, reprise | Presse-papiers remplacé ou refusé | Version installée, collage autorisé, code prérempli et conservé après relance |
| Application déjà installée | Schéma Winelio, route Expo, WebView ; lancement à froid/chaud | Course avec une ancienne référence | La dernière invitation explicite gagne |
| Site public | Vidéo, détection du téléphone, store, inscription web | Proposer un ancien binaire sans récupération | Applications disponibles avant activation des boutons ; contrôle du rendu public |

Les validations physiques n'exigent pas de créer un compte ni d'envoyer un email : contrôler le code prérempli suffit pour le transfert. L'attribution finale reste couverte par les validations serveur existantes.
