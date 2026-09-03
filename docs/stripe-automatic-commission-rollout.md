# Activation des débits automatiques de commission Stripe

Le code est volontairement inactif tant que `STRIPE_AUTOMATIC_COMMISSION_ENABLED` n'est pas défini à `true` côté serveur.

## Ordre d'activation obligatoire

1. Valider juridiquement et publier la version finale des Conditions Professionnels / CGV.
2. Vérifier le barème validé : 10 % jusqu'à 25 000 EUR inclus, puis 5 % sur la totalité de l'affaire au-dessus de 25 000 EUR.
3. Appliquer `20260903_automatic_card_commission_payments.sql` avant le déploiement du code.
4. Déployer l'application avec `STRIPE_AUTOMATIC_COMMISSION_ENABLED=false`.
5. Vérifier que le webhook Stripe de production livre au minimum :
   - `payment_intent.succeeded` ;
   - `payment_intent.payment_failed` ;
   - `checkout.session.completed` ;
   - `checkout.session.async_payment_succeeded`.
6. Tester en mode Stripe test : succès hors session, carte refusée, authentification requise, timeout simulé, webhook rejoué et double paiement concurrent.
7. Vérifier le cron `/api/stripe/cron-reminders` et son bloc `reconciliation`.
8. Obtenir une nouvelle autorisation des professionnels existants. Une carte historique sans consentement courant reste en paiement Checkout manuel.
9. Activer `STRIPE_AUTOMATIC_COMMISSION_ENABLED=true`, puis contrôler un premier paiement réel de faible montant de bout en bout.

Ne jamais activer la variable avant les étapes 1 à 8.
