# Invitation unique des membres

Vérification : 23 octobre 2026.

Le réseau propose une seule invitation. Liens copiés, QR, partage et e-mails conduisent à une inscription de particulier avec le même code parrain. Les anciens liens `type=pro` n’activent plus l’inscription professionnelle. L’ancien paramètre de préinscription `type=professional` n’ouvre plus de formulaire professionnel.

La préinscription serveur ignore les anciennes données professionnelles : profil particulier uniquement, aucune création d’entreprise. Le parrain vient toujours de la session de l’invitant et de son profil, jamais du client.

Le membre peut ensuite créer sa fiche depuis Ma fiche pro. Cette activation conserve sponsor_id. Le bonus de 1 % au parrain du professionnel reste calculé sur les affaires payées, y compris quand un autre membre recommande ce professionnel. Aucun calcul de commission ni donnée historique n’est modifié.

Les revendications de fiches existantes via /claim restent un parcours distinct ; elles ne sont pas une invitation professionnelle depuis le réseau.

Tests : anciennes requêtes pro de préinscription et d’e-mail, conservation du parrain, création ultérieure de fiche pro, liens de partage, affiliation répétée et absence de doublons. Les services d’authentification et d’envoi sont simulés dans ces tests : aucun compte, aucune entreprise ni aucun e-mail réels ne sont créés.
