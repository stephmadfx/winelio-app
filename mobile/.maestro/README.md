# Tests mobiles Winelio

Les flux valident la coque iOS/Android et s’adaptent à la session conservée par la WebView.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH="$HOME/.maestro/bin:$JAVA_HOME/bin:$PATH"
maestro test .maestro/smoke.yaml
```

| Flux | État | Validation |
|---|---|---|
| `smoke.yaml` | adaptatif | chargement natif, absence d’erreur réseau |
| `flows/guest-login.yaml` | déconnecté | bascule code email / mot de passe |
| `flows/authenticated-navigation.yaml` | connecté | navigation des cinq sections métier |
| `authenticated-e2e.yaml` | identifiants éphémères | connexion réelle et navigation des cinq sections métier |

`authenticated-e2e.yaml` reçoit `E2E_EMAIL` et `E2E_PASSWORD` à l’exécution.
Ces valeurs ne sont jamais conservées dans le dépôt.
