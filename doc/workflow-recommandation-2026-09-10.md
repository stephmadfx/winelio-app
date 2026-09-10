# Recommandations et avis — 10 septembre 2026

## Parcours retenu

Le recommandeur pilote le suivi en échangeant directement avec son contact. Le professionnel conserve ses déclarations : acceptation, devis et encaissement. Le client n’a aucune étape à valider dans Winelio.

| Étape | Responsable | Action |
| --- | --- | --- |
| 1 | Automatique | Recommandation reçue après création. |
| 2 | Professionnel | Accepter la recommandation. Refus et transfert restent disponibles. |
| 3 | Recommandeur | Confirmer la prise de contact avec le client. |
| 4 | Recommandeur | Confirmer le rendez-vous. |
| 5 | Professionnel | Renseigner le devis et son montant. Date prévue facultative. |
| 6 | Recommandeur | Confirmer auprès du contact que le devis est accepté. |
| 7 | Professionnel | Déclarer la prestation terminée et le paiement reçu ; déclencher le règlement de la commission Winelio. |
| 8 | Recommandeur | Confirmer la clôture après échange avec son contact. |

Les étapes ne peuvent pas être sautées ou validées par un autre rôle. Une affaire annulée, refusée, transférée ou expirée ne peut pas être poursuivie.

## Deux avis, une question

Après clôture **et** règlement de la commission du professionnel : « Est-ce que vous recommanderiez ce professionnel ? », de 1 à 5 étoiles, commentaire facultatif limité à 5 000 caractères, sans liens.

- Toute note valide du recommandeur, même 1 étoile, débloque sa commission. La valeur de la note n’influence jamais sa rémunération.
- Un seul email client pour cette recommandation : avis facultatif via un lien sécurisé valable 90 jours, sans compte obligatoire. Affiliation proposée avec le code du recommandeur seulement si le client n’est pas déjà affilié. Aucune inscription automatique.
- Aucun email intermédiaire au client : acceptation, validation du devis ou de la prestation, impayé du professionnel et invitation d’affiliation à la création sont retirés. Les anciens liens de validation renvoient une réponse 410.
- Un avis par rôle et par recommandation. Pas de deuxième invitation si le client est le recommandeur. Les reprises ne modifient pas un avis publié et ne créent pas de nouvel email.
- Chaque avis notifie le professionnel par email, même avec des étoiles seules. S’il contient un commentaire, le professionnel peut publier une seule réponse, non modifiable, de 5 000 caractères maximum, sans liens. Aucun fil de discussion, aucune réponse de l’auteur et aucun email supplémentaire au client.

## Affichage

Dans la recherche : étoiles, moyenne à une décimale française et petit lien « Voir les avis », sans commentaires. Sur la page dédiée : tous les avis publiés, paginés, provenance client/recommandeur, date, commentaire et réponse éventuels. Le lien de notification retrouve la page de l’avis même après l’ajout de nouveaux avis.

La moyenne porte sur toutes les notes effectivement déposées, de poids égal. Un client qui ne répond pas n’est pas compté. Le lien entre avis du recommandeur et commission est expliqué sur la page publique.

## Contrôles réalisés

- `node scripts/check-review-validation.cjs` : notes 1–5, texte facultatif, limite 5 000, refus des liens, répartition des rôles.
- `npx tsc --noEmit` : vérification TypeScript indépendante de la compilation Next.js.
- `node scripts/check-dual-review-flow.cjs` : navigateur réel local, huit étapes, droits, absence de saut, notification client unique en file d’envoi, reprises, mauvaise note rémunérée, deux avis et moyenne, réponse unique, lien expiré, affiliation, recherche et présentation mobile sans débordement.
- Comptes de test isolés puis supprimés avec leurs données. Paiement représenté par une ligne de test : aucune carte débitée et aucun email réel envoyé par ce scénario.
- Relecture des textes d’interface, formulaires, erreurs et emails dans les sources ; corrections des accents détectés, de formulations et des noms de catégories en base. Les commentaires libres des utilisateurs ne sont pas réécrits.

Le parcours de recommandation utilise désormais des routes serveur pour charger les contacts et rechercher les professionnels : cela corrige le chargement vide après connexion par mot de passe avec session HttpOnly.

## Publication

Les migrations additives sont appliquées avant publication. La migration d’activation des nouveaux rôles, de correction des catégories et de désactivation des anciens liens est appliquée une fois les deux environnements à jour. Les anciens messages client encore en attente sont marqués comme abandonnés, sans suppression de l’historique.
