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
