# Ouverture parasite de Stripe depuis une recommandation

Vérifié le 10 septembre 2026. Ticket `cba5d48c-3445-4096-908c-ca678afbbc82` (Thierry Carlier, 9 septembre).

## Cause et correction

La capture du ticket montre Safari sur `js.stripe.com`. L'import standard de `@stripe/stripe-js` dans `SavePaymentMethodDialog` injectait le script et son iframe technique dès l'import de la fiche, même avec le dialogue fermé et pour un recommandeur. Le test avant correction reproduit ces requêtes sur localhost et sur la production précédente.

L'import `@stripe/stripe-js/pure` supprime cet effet de bord. Stripe est chargé seulement lorsque le professionnel ouvre volontairement le formulaire après consentement. La politique mobile qui conserve les iframes Stripe dans la WebView était déjà présente ; elle est désormais couverte par des tests dédiés.

## Vérifications

- Test avant correction : échec attendu, chargement de `stripe.js` et `m-outer.html` pendant la simple consultation.
- Test après correction : recommandation terminée, huit étapes, consultation et rechargement sans requête vers `js.stripe.com`.
- Formulaire Stripe réel en sandbox : consentement requis, fermeture/réouverture, affichage des champs sans erreur CSP, erreur 503 simulée puis reprise réelle réussie. Aucun paiement effectué.
- Parcours adjacent : lien de paiement volontaire, contrôle du rôle et renouvellement d'une session expirée, test existant réussi.
- Neuf tests unitaires des politiques de chargement/navigation mobile réussis.
- TypeScript web/mobile et compilation Next.js réussis.
- Compilation iOS Release Simulator réussie ; parcours de consultation sur le site public dans Winelio iOS 18.6, puis arrêt/relance et réouverture de la fiche réussis (Maestro).
- Correctif applicatif `732c7c61` déployé sur production et dev2, déploiements Coolify terminés. Les commits de tests/doc ultérieurs ne changent pas le code applicatif.
- Comptes temporaires, données applicatives, objets Stripe sandbox et intentions non confirmées nettoyés après les scénarios.

Captures : `output/playwright/ios-recommendation-after-relaunch.png`, `output/playwright/recommendation-without-stripe.png`, `output/playwright/stripe-form-after-consent.png`.

## Rejouer

```sh
node --experimental-strip-types --test mobile/src/features/webapp/*.test.ts
E2E_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/save-payment-method.spec.ts tests/e2e/commission-payment-link.spec.ts --project=chromium
E2E_BASE_URL=https://winelio.app E2E_CONSULTATION_ONLY=1 E2E_IOS_DEVICE=39525C7F-6B24-410A-923E-92767433A62F npx playwright test tests/e2e/save-payment-method.spec.ts --project=chromium
```

Le mode public ne crée aucun objet Stripe live. Ne pas lancer plusieurs suites simultanément : leur nettoyage utilise le domaine réservé `winelio-e2e.local`. Ne pas lancer `maestro hierarchy` pendant un test Maestro : cela interrompt son pilote iOS. Garder le simulateur visible pour le contrôle visuel. Les captures montrent des données de test, pas le compte de Thierry.

## Limites

Le téléphone physique de Thierry et sa version App Store n'ont pas été manipulés. La correction livrée est web et ne nécessite pas de nouveau binaire pour supprimer le chargement parasite lors de la consultation. Aucune soumission App Store ni opération financière réelle n'a été effectuée.

Le build local Expo sur le disque « X10 Pro » a nécessité des corrections de guillemets dans les fichiers générés ignorés par Git : script EXConstants, `basename "$PROJECT_DIR"` et invocation du script `react-native-xcode.sh`. Cela concerne l'environnement de compilation local.
