# Winelio — incidence d’une messagerie sur le VPS

Vérification en lecture seule le 30 octobre 2026. Aucune messagerie, modification de limites, mise à niveau ou simulation de charge n’a été exécutée.

## Ressources observées

- VPS partagé : 4 vCPU, environ 15,6 Gio de RAM ; 7,8 Gio disponibles au relevé ; environ 75 Go de disque libres (62 % utilisés).
- Swap : 7,2 Gio sur 8 utilisés. Sur cinq secondes de vmstat, très peu d’entrées et aucune sortie de swap après le premier relevé cumulatif ; pression mémoire instantanée Linux nulle. Cela n’exclut pas une pression antérieure, notamment lors des builds.
- Charge système 1/5/15 min : 2,88 / 3,82 / 4,77, relevée peu après les déploiements. Ce n’est pas une mesure de capacité à l’heure de pointe. CPU steal 9–19 % sur les quatre échantillons courts : la disponibilité des vCPU peut varier sur l’hôte partagé.
- Les conteneurs web Winelio main et dev2 utilisent chacun environ 173–178 Mio au relevé ; la base, le temps réel et les autres applications consomment des ressources supplémentaires.
- Tenant Realtime utilisé par le Supabase existant : `max_concurrent_users=200`, `max_events_per_second=100`, `max_channels_per_client=100`. Valeurs lues sans accéder aux secrets. Ces plafonds concernent l’instance/tenant et les connexions, pas simplement le nombre de comptes Winelio.

## Ce qui détermine la charge

Nombre d’utilisateurs simultanés, fréquence des messages, destinataires connectés par groupe, reconnexions, droits d’accès et quantité de médias. Les inscrits inactifs ne maintiennent pas de connexion de chat.

| Scénario illustratif | Conséquence |
|---|---|
| 5 000 inscrits, 50 connectés et petits groupes texte | Hypothèse compatible avec une architecture modeste ; à confirmer par mesures réelles, sans garantie issue du relevé |
| 5 000 inscrits, 250 connectés | Le plafond actuel de 200 connexions doit déjà être revu ; le relever ne crée pas de ressources CPU/RAM |
| 5 000 personnes simultanément dans un même salon | Un message peut nécessiter 5 000 livraisons ; à 10 messages/s, jusqu’à 50 000 livraisons/s. Prévoir une architecture et des essais dédiés |
| Photos, vidéos et fichiers | Stockage et bande passante potentiellement dominants ; objets à héberger hors du disque VPS |

Exemple de volume, non prévision d’usage : 50 000 messages par jour × 30 jours × 1 ko de contenu ≈ 1,5 Go de texte brut par mois. Métadonnées, index, journaux PostgreSQL, sauvegardes et pièces jointes s’ajoutent.

## Orientation proposée

Commencer par du texte, des groupes limités, une pagination d’environ 50 messages et un chargement de l’historique à la demande. Éviter le polling fréquent et l’abonnement global à toute la table des messages. Garder des canaux privés, des permissions par groupe, une limitation du débit, des pièces jointes sur stockage objet, et des indicateurs de présence/lecture limités aux besoins utiles.

Pour monter en charge, séparer le service de messagerie ou son moteur temps réel afin qu’il ne ralentisse pas les recommandations, paiements et les autres applications. Broadcast peut éviter certains coûts de vérification par abonné de Postgres Changes ; vérifier d’abord la compatibilité de la version Realtime déployée, puis tester 50, 200, 500 et 1 000 connexions avec une charge réaliste avant de promettre une capacité. Pas de remplacement du VPS décidé sur le seul nombre de comptes.

Sources primaires consultées :

- [Supabase — Postgres Changes et limites de montée en charge](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase — configuration Realtime self-hosted](https://supabase.com/docs/guides/self-hosting/realtime/config)
- [Supabase — réglages des connexions et événements](https://supabase.com/docs/guides/realtime/settings)
