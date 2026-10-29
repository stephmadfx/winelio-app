# Lead d’un professionnel non inscrit — 29 octobre 2026

## Parcours livré

1. Le mail explique l’inscription gratuite comme **particulier**, avec le parrain prérempli.
2. Après authentification, le destinataire crée ou complète sa fiche dans le parcours professionnel existant (SIRET vérifié, catégorie, e-mail professionnel, assurance et consentement explicite).
3. Le parcours revient au lead d’origine ; le membre confirme sa récupération avec sa fiche professionnelle.

L’inscription ne crée plus d’entreprise et n’active jamais le statut pro, même si un ancien client envoie `isPro: true`. La confirmation d’inscription et le détour par la vidéo de présentation conservent la destination du lead. Les catégories qui nécessitent une signature finalisent aussi la fiche après la signature ; la signature seule n’active plus le statut professionnel.

## Autorisation et intégrité

Un identifiant de recommandation seul ne permet plus de revendiquer une fiche. Le serveur exige soit l’adresse authentifiée et vérifiée du destinataire, soit la preuve signée du lien de notification. Les nouveaux liens portent une preuve HMAC valable 30 jours ; elle est conservée en cookie HttpOnly lors de la redirection, sans l’exposer dans l’URL finale du parcours. Signature serveur avec `CLAIM_LINK_SECRET` si configuré, sinon avec l’environnement sécurisé existant ; aucune nouvelle clé à copier dans le dépôt.

La migration `20261029_claim_after_individual_onboarding.sql` ajoute une opération transactionnelle réservée au rôle serveur. Elle vérifie la fiche source unique, la propriété de la fiche de destination, son SIRET et son assurance, l’activité du compte et l’achèvement du parcours pro. Un SIRET source connu doit correspondre au même SIREN.

Les recommandations de cette unique entreprise importée sont rattachées ensemble au professionnel autorisé. La fiche importée est archivée pour ne pas créer un doublon dans l’annuaire. Une source ambiguë est refusée. Les accès concurrents sont verrouillés ; une nouvelle tentative du propriétaire déjà rattaché est sans effet supplémentaire. Aucun parrain, mouvement financier ni instantané de paiement n’est réécrit ; le bonus d’affiliation de 1 % continue d’utiliser le parrain inchangé du professionnel.

## Vérifications

- Build Next et TypeScript réussis ; tests ciblés inscription, parrainage, partage Android, affiliation et revendication réussis.
- Test navigateur local au format mobile, sur les vrais services et la migration appliquée : formulaire d’inscription particulier avec parrain prérempli, compte particulier confirmé de test, refus avant onboarding, parcours pro complet avec vérification réelle au registre, consentement, retour au lead, récupération, rechargement, conservation du parrain, refus d’un compte tiers et d’une fiche étrangère, reprise sans doublon. Toutes les recommandations de la fiche source restent accessibles.
- Appel direct de l’opération SQL par un client authentifié refusé.
- Tests spécifiques : signature expirée/falsifiée/autre lead, ancienne adresse destinataire vérifiée, refus sans consentement ou signature métier, absence d’activation pro si la sauvegarde de la fiche échoue, signature seule sans activation, confirmation conservant uniquement une destination interne autorisée, cookie HttpOnly et redirection sans preuve.
- Les comptes Auth des essais sont créés déjà confirmés afin de ne pas envoyer de confirmation réelle. Le lien de confirmation est testé avec un dispatcher simulé. Aucun e-mail réel ni nouveau message WhatsApp n’a été envoyé pendant cette correction.
- Nettoyage vérifié : Auth, profils, wallets, entreprises, recommandations, contacts, événements d’onboarding et e-mails temporaires. Contrôle final des résidus : zéro compte Auth, profil, entreprise et ligne d’e-mail de test.

Tests : `tests/regression/claim-onboarding.cjs` et `tests/regression/claim-onboarding-ui.cjs`. Ce dernier utilise la configuration d’environnement locale et exige un serveur local avec `EMAIL_SENDING_ENABLED=false`. Les destinataires de test restent dans le domaine réservé aux tests du projet et sont exclus de l’envoi par le worker.

Preuves locales : `output/claim-onboarding-20261029/` ; les captures ne contiennent que des données de test.

## Livraison

Migration appliquée sur le schéma partagé Winelio avant livraison du code. Même correction à pousser atomiquement et déployer sur `main` et `dev2`, avec vérification du commit réellement actif et du rendu public de chaque environnement. Aucun nouveau binaire Android ou iOS nécessaire pour ce parcours web. Le build Android 1.0.1 (13), déjà soumis, reste indépendant de cette évolution.
