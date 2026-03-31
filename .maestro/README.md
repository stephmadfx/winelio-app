# Tests Maestro - Kiparlo

Tests E2E mobiles pour l'app web Next.js Kiparlo, via Maestro.

## Prérequis

```bash
# Installer Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash
brew install openjdk@17
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home

# Démarrer l'app
npm run dev
```

> L'app doit tourner sur `http://localhost:3000` avant de lancer les tests.
> L'utilisateur doit être **connecté** dans le navigateur du simulateur/émulateur.

## Lancer les tests

### Android (émulateur)
```bash
# Smoke test rapide
maestro test .maestro/reco-smoke-android.yaml

# Création d'une recommandation (3 étapes)
maestro test .maestro/reco-new-android.yaml

# Détail d'une recommandation
maestro test .maestro/reco-detail-android.yaml

# Tous les tests reco Android
maestro test --include-tags android,reco .maestro/
```

### iOS (simulateur)
```bash
# Smoke test rapide
maestro test .maestro/reco-smoke-ios.yaml

# Création d'une recommandation
maestro test .maestro/reco-new-ios.yaml

# Détail d'une recommandation
maestro test .maestro/reco-detail-ios.yaml

# Tous les tests reco iOS
maestro test --include-tags ios,reco .maestro/
```

### Mode debug (step by step)
```bash
maestro test --debug .maestro/reco-smoke-android.yaml
```

### Mode interactif (builder)
```bash
maestro studio
```

## Inventaire des tests

| Fichier | Plateforme | Ce qui est testé |
|---------|------------|-----------------|
| `reco-smoke-android.yaml` | Android | Chargement page, onglets, filtres, bouton "Nouvelle reco" |
| `reco-smoke-ios.yaml` | iOS | Idem + fixes cold boot XCTest |
| `reco-new-android.yaml` | Android | Formulaire 3 étapes (contact → pro → projet → soumission) |
| `reco-new-ios.yaml` | iOS | Idem + hideKeyboard après chaque input |
| `reco-detail-android.yaml` | Android | Ouverture reco depuis liste, timeline étapes, retour |
| `reco-detail-ios.yaml` | iOS | Idem + swipe iOS |

## Notes importantes

- **Pas de testID** dans le code actuel → sélecteurs par **texte visible** (en français)
- **iOS** : le `launchApp` est toujours suivi d'un swipe DOWN pour éviter le crash XCTest
- **iOS** : `hideKeyboard` après chaque `inputText` pour libérer l'espace
- **Auth** : les tests supposent une session active. Si redirigé vers `/auth/login`, ouvrir le browser manuellement et se connecter d'abord
- Les screenshots sont sauvegardés dans `~/.maestro/tests/{timestamp}/`
