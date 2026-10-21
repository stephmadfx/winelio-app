# Winelio — factures et attestations

Dernière vérification : 21 octobre 2026.

## Règles

- EXASUD exploite provisoirement WINELIO. Identité fournie par Christophe ; forme SAS et capital de 7 622,45 EUR vérifiés dans le RNE/INPI : https://data.inpi.fr/export/companies?format=pdf&ids=%5B%22422432864%22%5D.
- Tous les calculs de commission et de répartition restent sur le TTC. Le module documentaire ne change aucun taux ni montant versé aux affiliés. Une facture de 100 EUR TTC contient 83,33 EUR HT et 16,67 EUR de TVA à 20 %.
- La TVA est ventilée sur la facture ; elle n'est pas déduite des commissions des affiliés. La comptabilisation de la TVA dans la marge d'EXASUD relève du suivi comptable.
- Une facture est émise à l'encaissement confirmé de la commission Stripe. Une attestation est émise au passage du retrait à `COMPLETED`, avec `processed_at` renseigné. Aucune attestation pour une demande ou un traitement en cours.
- Les soldes avant/après correspondent à la demande de retrait, avant réservation de la somme par `process_withdrawal`. Ils sont enregistrés sous verrou du wallet. L'attestation distingue brut, frais et net réellement versé.
- Le RPC serveur `recalculate_wallet` conserve les réservations des retraits `PENDING` et `PROCESSING`, ainsi que les montants déjà `COMPLETED` ; un rejet libère uniquement le retrait rejeté. Il utilise le même verrou de wallet que les demandes de retrait et les crédits de commission. Ceci corrige une anomalie préexistante qui pouvait libérer les autres demandes en attente lors d'un recalcul, ainsi que le risque d'écrasement d'une réservation concurrente. Les calculs de commissions et les Wins conservent leurs règles.
- Les informations non renseignées ne sont jamais inventées. Des coordonnées incomplètes à l'émission sont signalées dans la liste. Contrôler la complétude des coordonnées professionnelles avant les opérations réelles.
- Aucun email ajouté. Documents dans `/companies/invoices`, `/wallet/documents`, supervision et export annuel dans `/gestion-reseau/comptabilite`.
- Le relevé `/wallet/history` utilise une vue de mouvements avec RLS des tables sources et pagination commune aux commissions et retraits ; les Wins restent distingués des EUR.

## Intégrité et historique

Les triggers DB couvrent Stripe Checkout, les débits automatiques, les reprises et les retraits administratifs. Une seule facture par recommandation, une seule pièce par source. Les séries `FAC-AAAA-NNNN` et `ATT-AAAA-NNNN` utilisent des compteurs transactionnels et un verrou par série. Un rollback annule aussi le numéro. Les démonstrations utilisent exclusivement `TEST-FAC-*` / `TEST-ATT-*`, hors séries et exports réels.

`accounting_documents` conserve un instantané immuable de l'émetteur, du destinataire, des montants, dates et textes. Aucune FK vers les comptes ou paiements ne peut supprimer ces archives par cascade. Les PDF sont générés avec WeasyPrint (installé dans l'image Docker), archivés une fois avec leur SHA-256 et renvoyés octet pour octet. Une erreur PDF laisse la pièce disponible pour reprise au téléchargement. Les données et fichiers réels sont protégés contre UPDATE/DELETE, même via service_role ; seuls les documents de démonstration sont supprimables pour nettoyage.

La RLS autorise le propriétaire et les super-administrateurs. Les fichiers sont uniquement accessibles au serveur après contrôle d'accès sur la pièce. Aucun bucket public.

Le modèle `template_version=1` doit rester stable pour les documents existants. Pour faire évoluer les modèles futurs, ajouter un nouveau rendu et une nouvelle version ; ne pas modifier le rendu historique. Aucun ancien paiement n'est refacturé automatiquement : le backoffice signale les paiements réels sans facture pour contrôle des justificatifs préexistants et des coordonnées avant régularisation.

## Changement d'émetteur

Dans une transaction, désactiver l'émetteur actuel puis **insérer une nouvelle ligne** dans `accounting_issuers` avec les informations validées de WINELIO et `active=true`. Renseigner tous les identifiants, la forme juridique, le capital, la TVA et la description d'exploitation. Ne pas renommer EXASUD et ne jamais modifier `accounting_documents` / `accounting_document_files`. Les nouvelles pièces utilisent la nouvelle société ; les anciennes conservent EXASUD. La séquence annuelle continue, sans remise à zéro lors de la bascule.

## Suivi fiscal

L'export CSV admin porte sur les versements **confirmés**, par date de règlement en heure française, depuis les attestations figées. Il conserve toutes les lignes dès le premier euro (brut, frais, net, identité, émetteur) et exclut les démos. C'est un suivi préparatoire, sans transmission fiscale ni qualification automatique du statut du bénéficiaire. Seuil DAS2 : sommes dépassant 2 400 EUR par an et bénéficiaire (https://entreprendre.service-public.gouv.fr/vosdroits/F31431).

## Vérifications

- `npx tsx tests/integration/accounting-documents.ts` : commissions TTC inchangées, ventilation et arrondis, échappement HTML, versions de modèles et PDF de démonstration.
- `tests/integration/accounting-documents.sql` : exécuter sous `BEGIN` puis toujours `ROLLBACK` ; couvre génération, états non payés, idempotence, snapshots, changement d'émetteur, frais/soldes, immutabilité, rollback du compteur et RLS propriétaire/tiers/admin. Ne jamais committer les données de ce test.
- `E2E_BASE_URL=http://localhost:3001 npx tsx --env-file=tests/e2e/.env.test tests/integration/accounting-browser.ts` : navigation desktop/mobile, téléchargements, PDF inchangé après édition du client, accès tiers/anonyme, permissions CSV, historique, rechargement ; nettoyage des comptes, wallets, retraits et pièces de test en `finally`.
- `npm run build` et `npx tsc --noEmit`.
- `npx tsx --env-file=tests/e2e/.env.test tests/integration/wallet-reservations.ts` : deux retraits simultanés, recalcul, paiement d'un retrait et rejet de l'autre, puis nettoyage de toutes les données de démonstration.

Les environnements partagent Supabase : appliquer les migrations `20261021*` dans l'ordre avant le déploiement. L'accès PostgreSQL local nécessite un tunnel SSH vers le conteneur Supabase courant ; ne pas se fier à une ancienne IP Docker. Aucun secret ne doit être ajouté à ce document.
