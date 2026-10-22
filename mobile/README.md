# Winelio Mobile

Application iOS et Android Expo/React Native de Winelio. La web app mobile
existante reste la source de vérité visuelle.

## Démarrage

1. Copier `.env.example` vers `.env.local` et renseigner uniquement les
   variables publiques.
2. Installer les dépendances avec `pnpm install`.
3. Lancer `pnpm ios` ou `pnpm android`.

## Principes d'architecture

- Les calculs de commissions, retraits et autres opérations sensibles restent
  exclusivement côté serveur.
- Le client mobile utilise Supabase avec les politiques RLS existantes.
- Les appels OTP passent par l'API Winelio afin de conserver le même parcours
  que la web app.
- Les tokens de session sont stockés dans le trousseau sécurisé du téléphone.
- Le back-office reste dans l'application Next.js.

## Design

Les couleurs, rayons, ombres et espacements sont centralisés dans
`src/design-system/tokens.ts`. Toute divergence volontaire avec la web app doit
être documentée et validée.

## Livraison aux stores — locale uniquement

Les compilations se font sur le Mac : Xcode pour iPhone et Gradle pour Android, puis envoi des fichiers IPA/AAB aux stores. Ne pas utiliser de service de compilation distant. Expo est uniquement le SDK et l’outillage local de ce projet.

Avant la génération native, définir `EXPO_PUBLIC_WEB_APP_URL=https://winelio.app`. Les numéros de version et de build sont dans `app.json`. Régénérer si nécessaire les projets avec `npx expo prebuild --no-install`, puis installer les pods localement. Les répertoires générés `ios/` et `android/` restent exclus de Git. Les sources du module de parrainage dans `modules/` doivent être conservées.

Archiver le schéma Winelio en Release avec Xcode, exporter pour App Store et envoyer l’IPA. Pour Android, exécuter `python3 scripts/build-android-release.py` depuis `mobile/` avec la signature de publication locale, puis importer l’AAB dans Google Play Console. Les mots de passe et clés de signature restent dans le trousseau ou l’environnement sécurisé, jamais dans les commandes, le dépôt ou cette documentation.

Une validation locale ne remplace pas la première installation des versions distribuées par les stores. Activer les boutons de téléchargement de parrainage après leur disponibilité.

### Géolocalisation Android

Le patch pnpm de `react-native-webview@13.15.0` demande les permissions précise et approximative ensemble, et accepte l'une ou l'autre. Il reste nécessaire avec cette version de WebView même si les deux permissions sont déclarées dans `app.json`. Après une réinstallation des dépendances ou une mise à jour de WebView, vérifier avec `python3 tests/regression/android-location-permissions.py` depuis la racine du dépôt, puis tester les permissions sur Android.
