# Relances automatiques au pro après acceptation d'une recommandation

**Date** : 2026-05-01
**Statut** : design validé, en attente du plan d'implémentation
**Auteur** : Steph + Claude (brainstorming)

## Contexte et objectif

Aujourd'hui, lorsqu'un professionnel accepte une recommandation, rien ne le pousse à
avancer dans le workflow. Une recommandation peut rester bloquée à l'étape 2
(Acceptée), 4 (Rendez-vous fixé) ou 5 (Devis soumis) pendant des semaines, sans que
ni le client ni le referrer ne soient informés. Le but de cette feature est :

- D'**inciter le pro à donner suite** par des relances email ciblées et espacées
- De **récupérer la main côté referrer** quand le pro abandonne (sans transfert auto)
- De **garder un audit trail** des relances envoyées et reportées

Le workflow actuel comporte 7 étapes (cf. `doc/database.md` après la migration
`20260427_restructure_steps.sql`) :

| Order | Nom | `completion_role` |
|-------|-----|-------------------|
| 1 | Recommandation reçue | PROFESSIONAL |
| 2 | Acceptée par le professionnel | PROFESSIONAL |
| 3 | Contact établi | PROFESSIONAL |
| 4 | Rendez-vous fixé | PROFESSIONAL |
| 5 | Devis soumis | PROFESSIONAL |
| 6 | Travaux terminés + Paiement reçu du client | PROFESSIONAL |
| 7 | Affaire terminée | PROFESSIONAL |

Les relances ne concernent **que** les transitions 2→3, 4→5 et 5→6. Les autres étapes
(1, 3, 6) ne déclenchent pas de relance.

## Vue d'ensemble du flux

### Délais de la 1ère relance

| Étape complétée | Cible de la relance | Délai 1ère relance |
|-----------------|---------------------|--------------------|
| 2 — Acceptée | Pousser vers étape 3 (Contact établi) | **24h** (fixe) |
| 4 — RDV fixé | Pousser vers étape 5 (Devis soumis) | **72h** (fixe) |
| 5 — Devis soumis | Pousser vers étape 6 (Travaux + paiement) | **Date saisie par le pro** lors de la soumission du devis |

### Cycle de 3 relances par étape

Si le pro ne réagit pas à la 1ère relance, deux relances supplémentaires sont
envoyées : `cycle_index=1` à T₀, `cycle_index=2` à T₀+48h, `cycle_index=3` à T₀+5j.

Si la 3ème relance reste sans action :
- `recommendations.abandoned_by_pro_at` est posé à `now()`
- Un email "soft" est envoyé au referrer
- La reco **reste assignée au pro** (pas de transfert auto)
- Le referrer voit un badge "Abandonnée par le pro" et peut transférer manuellement
  via l'infrastructure `transfer_recommendation` existante

### Actions disponibles dans chaque email

L'email contient 3 actions, accessibles via une URL avec token HMAC signé :

| Bouton | Effet |
|--------|-------|
| ✅ **C'est fait** | Complète l'étape `after_step_order + 1`, le trigger SQL cancel les followups pending |
| 📅 **Reporter** | Mène à une page publique avec 4 choix : `+48h`, `+1 sem`, `+1 mois`, date libre. Met à jour `scheduled_at`, reset `cycle_index=1`, incrémente `report_count` (max **5 reports** par étape) |
| ❌ **Abandon** | Mène à une page de confirmation, puis refuse la reco (réutilise `notify-reco-refused.ts`) et cancel tous les followups |

### Champ `expected_completion_at` (étape 5)

Au moment de soumettre le devis (complétion de l'étape 5), le pro doit obligatoirement
choisir un délai estimé avant la fin des travaux + paiement :

| Choix UI | Date stockée |
|----------|--------------|
| Sous 7 jours | `now() + 7j` |
| 2-4 semaines | `now() + 28j` |
| 1-3 mois | `now() + 90j` |
| 3-6 mois | `now() + 180j` |
| Plus de 6 mois | `now() + 365j` |
| Date précise (calendrier) | Date saisie, validée `> now() + 1j` et `< now() + 2 ans` |

Le champ est obligatoire : sans valeur, l'étape 5 ne peut pas être marquée complétée
(validation client + serveur). Pour les recos historiques sans cette donnée, le
trigger SQL ne crée simplement pas de followup étape 5.

## Schéma DB

### Nouvelle table `winelio.recommendation_followups`

```sql
CREATE TABLE winelio.recommendation_followups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  after_step_order  smallint NOT NULL CHECK (after_step_order IN (2, 4, 5)),
  cycle_index       smallint NOT NULL CHECK (cycle_index BETWEEN 1 AND 3),
  scheduled_at      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','cancelled','superseded')),
  sent_at           timestamptz,
  report_count      smallint NOT NULL DEFAULT 0,
  cancel_reason     text, -- 'next_step_done' | 'reco_refused' | 'reco_transferred' | 'pro_abandoned' | 'pro_inactive'
  email_queue_id    uuid REFERENCES winelio.email_queue(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON winelio.recommendation_followups (status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX ON winelio.recommendation_followups (recommendation_id, after_step_order);

CREATE UNIQUE INDEX recommendation_followups_one_pending_per_step
  ON winelio.recommendation_followups (recommendation_id, after_step_order)
  WHERE status = 'pending';
```

### Modifications de `winelio.recommendations`

```sql
ALTER TABLE winelio.recommendations
  ADD COLUMN expected_completion_at timestamptz,
  ADD COLUMN abandoned_by_pro_at    timestamptz;

COMMENT ON COLUMN winelio.recommendations.expected_completion_at IS
  'Date prévue de fin des travaux + paiement, saisie par le pro lors de la soumission du devis (étape 5). Sert à programmer la 1ère relance étape 5.';

COMMENT ON COLUMN winelio.recommendations.abandoned_by_pro_at IS
  'Date à laquelle le cycle de 3 relances s''est terminé sans action du pro. La reco reste assignée mais affichée "abandonnée" côté referrer.';
```

### Trigger d'insertion automatique des followups

À la complétion d'un step d'order 2, 4 ou 5 → insère un followup `cycle_index=1`.
À la complétion d'un step d'order 3, 5 ou 6 (donc step suivant) → cancel les
followups pending de l'étape précédente.

```sql
CREATE OR REPLACE FUNCTION winelio.handle_recommendation_step_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  step_order smallint;
  delay      interval;
  next_at    timestamptz;
BEGIN
  IF NEW.completed_at IS NULL OR (OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT s.order_index INTO step_order
    FROM winelio.steps s WHERE s.id = NEW.step_id;

  -- Cancel les followups pending de l'étape précédente
  UPDATE winelio.recommendation_followups
     SET status = 'cancelled', cancel_reason = 'next_step_done', updated_at = now()
   WHERE recommendation_id = NEW.recommendation_id
     AND status = 'pending'
     AND after_step_order = step_order - 1;

  -- Crée un followup si l'étape complétée est 2, 4 ou 5
  IF step_order IN (2, 4) THEN
    delay   := CASE WHEN step_order = 2 THEN interval '24 hours' ELSE interval '72 hours' END;
    next_at := NEW.completed_at + delay;
    INSERT INTO winelio.recommendation_followups
      (recommendation_id, after_step_order, cycle_index, scheduled_at)
    VALUES (NEW.recommendation_id, step_order, 1, next_at)
    ON CONFLICT DO NOTHING;
  ELSIF step_order = 5 THEN
    SELECT expected_completion_at INTO next_at
      FROM winelio.recommendations WHERE id = NEW.recommendation_id;
    IF next_at IS NOT NULL THEN
      INSERT INTO winelio.recommendation_followups
        (recommendation_id, after_step_order, cycle_index, scheduled_at)
      VALUES (NEW.recommendation_id, 5, 1, next_at)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_recommendation_step_followup
  AFTER INSERT OR UPDATE OF completed_at ON winelio.recommendation_steps
  FOR EACH ROW EXECUTE FUNCTION winelio.handle_recommendation_step_completion();
```

**Annulations sur refus / transfert / suppression** : pas de trigger dédié, gérées
explicitement dans le code applicatif (Server Action `refuseRecommendation`, route
`transfer_recommendation`) pour rester lisible et tracé en audit. La suppression
d'une reco bénéficie du `ON DELETE CASCADE`.

## Endpoints

### `POST /api/recommendations/process-followups` (cron worker)

Auth `Bearer ${CRON_SECRET}`. Déclenché toutes les 15 minutes par cron externe.

```
1. SELECT id, recommendation_id, after_step_order, cycle_index, sent_at
   FROM recommendation_followups
   WHERE status='pending' AND scheduled_at <= now()
   ORDER BY scheduled_at LIMIT 50

2. Pour chaque followup:
   a. Re-vérifier les conditions live :
      - Étape (after_step_order + 1) déjà complétée ?
        → status='cancelled', cancel_reason='next_step_done', skip
      - Reco refusée / transférée / supprimée ?
        → status='cancelled', cancel_reason='reco_refused'|'reco_transferred', skip
      - Profil pro supprimé OU company.deleted_at IS NOT NULL ?
        → status='cancelled', cancel_reason='pro_inactive', skip
   b. queueEmail via lib/notify-pro-followup.ts (paramètre after_step_order, cycle_index)
   c. UPDATE: status='sent', sent_at=now(), email_queue_id=<retour de queueEmail>
   d. Si cycle_index < 3 :
        delay = (cycle_index = 1) ? interval '48 hours' : interval '5 days'
        INSERT followup suivant (cycle_index+1, scheduled_at = now() + delay)
   e. Si cycle_index = 3 :
        UPDATE recommendations SET abandoned_by_pro_at = now() WHERE id = ...
        queueEmail via lib/notify-pro-abandoned.ts → referrer
```

Idempotent : un followup déjà `sent` n'est pas retraité. La création du followup
suivant utilise `ON CONFLICT DO NOTHING` (index unique partiel) pour éviter les
doublons en cas de retry.

### `GET /api/recommendations/followup-action`

Pas d'auth Supabase requise (le pro est sur son mail). Token HMAC-SHA256 signé avec
la clé `FOLLOWUP_ACTION_SECRET`.

```
?token=<base64url(payload).signature>&action=done|postpone|abandon[&postpone_to=<ISO>]

payload = { fid: <followup_id>, exp: <epoch + 30j>, v: 1 }
```

Module helper : `src/lib/followup-token.ts` (sign/verify HMAC).

| `action` | Comportement |
|----------|-------------|
| `done` | Vérifie token → relit followup → upsert `recommendation_steps` pour l'étape `after_step_order + 1` avec `completed_at=now()`. Le trigger SQL fait le reste (cancel + new followup). Redirect HTML "✅ Étape marquée comme faite". Idempotent : si l'étape est déjà complétée, page "Déjà fait, merci". |
| `postpone` | Vérifie `report_count < 5`. `postpone_to` doit être ≥ `now() + 1h` et ≤ `now() + 1 an`. UPDATE le followup (`scheduled_at = postpone_to`, `cycle_index = 1`, `report_count = report_count + 1`). Page "📅 Reporté au …". |
| `abandon` | Page de confirmation HTML avec bouton final. Au POST → marque la reco refusée (réutilise `notify-reco-refused.ts`) → cancel tous les followups pending de cette reco. |

Sécurité :
- Token signé + `exp` ≤ 30j
- Le payload ne contient que `fid` ; on relit toujours la DB pour les autorisations
- Action `done` est idempotente
- Si token expiré ou invalide → page d'erreur "Ce lien a expiré"
- Si followup déjà `cancelled`/`sent` (et action conflictuelle) → page "Cette relance a déjà été traitée"

### Pages publiques (sans auth, avec token)

- `/recommendations/followup/[token]/postpone` — menu intermédiaire `+48h / +1 sem / +1 mois / autre date`. POST → `/api/recommendations/followup-action`. Affiche `report_count` restant.
- `/recommendations/followup/[token]/abandon` — page de confirmation, POST → `/api/recommendations/followup-action`.

### Soumission de devis (étape 5) — modification

Le code qui complète l'étape 5 (probablement dans
`src/app/(protected)/recommendations/[id]/` ou via Server Action complétion d'étape)
doit :

1. Recevoir `expected_completion_at` (date) — champ obligatoire
2. UPDATE `recommendations.expected_completion_at = <date>` **avant** l'UPDATE de
   `recommendation_steps.completed_at` (le trigger SQL lit ce champ pour calculer
   `next_at` à l'étape 5)
3. Si `expected_completion_at` est null/manquant → renvoyer 400

## Templates email

### `src/lib/notify-pro-followup.ts`

Module unique paramétré par `after_step_order` et `cycle_index`. Charte Winelio
standard (cf. `CLAUDE.md` section "Templates email — Charte visuelle obligatoire") :

- Container 520px sur fond `#F0F2F4`
- Barre accent dégradé orange en haut
- Logo R2 (`LOGO_IMG_HTML`)
- Icône emoji dans tile dégradée (`🔔` cycle 1, `⏰` cycle 2, `⚠️` cycle 3)
- H1 selon cycle :
  - Cycle 1 : "Avez-vous {action} ?"
  - Cycle 2 : "Toujours intéressé par cette recommandation ?"
  - Cycle 3 : "Dernière relance — votre client attend une réponse"
- Question principale selon `after_step_order` :
  - 2 : "Avez-vous bien pris contact avec **{contactName}** ?"
  - 4 : "Avez-vous transmis le devis à **{contactName}** ?"
  - 5 : "Les travaux pour **{contactName}** sont-ils terminés et le paiement reçu ?"
- Bloc accent `#FFF5F0` border-left orange : *"Si c'est fait, marquez-le en 1 clic. Sinon, dites-nous quand vous serez en mesure de le faire."*
- 3 CTA dans une table HTML :
  - Bouton dégradé orange `✅ C'est fait` → URL token + `action=done`
  - Bouton outline orange `📅 Reporter` → page `/recommendations/followup/[token]/postpone`
  - Lien gris discret `Je ne peux pas donner suite` → page `/recommendations/followup/[token]/abandon`
- Footer Winelio standard

### `src/lib/notify-pro-abandoned.ts`

Email envoyé au referrer après le cycle de 3 relances sans action :

- Charte standard, icône `😞` neutre (pas d'emoji blâmant)
- Titre : "Le pro n'a pas donné suite à votre recommandation"
- Corps : "{proName} n'a pas répondu à plusieurs relances concernant votre recommandation pour {contactName}. Vous pouvez reprendre la main et la transférer à un autre pro depuis votre tableau de bord."
- CTA : "Voir ma recommandation →" vers `/recommendations/[id]`

## Modifications UI

### Formulaire de soumission du devis (étape 5)

Ajouter un champ obligatoire **"Délai estimé avant fin des travaux + paiement"** :

```
○ Sous 7 jours
○ 2-4 semaines
○ 1-3 mois
○ 3-6 mois
○ Plus de 6 mois
○ Date précise → [date picker shadcn]
```

Helper text sous le champ : *"Nous vous enverrons un rappel à cette date pour
confirmer la fin du chantier. Vous pourrez le reporter si besoin."*

Validation côté client + serveur. Le mapping radio → date est fait côté serveur
(à partir de `now()` au moment de la soumission).

### Affichage côté pro — `/recommendations/[id]`

Sous chaque étape 2/4/5 complétée mais étape suivante non complétée, un encart :

```
🔔 Prochaine relance dans X jours (cycle X/3)
   [ Marquer comme fait ] [ Reporter ]
```

Pour l'étape 5 : afficher *"Date de fin prévue : 12 mai 2026"* avec un bouton
"Modifier" qui met à jour `expected_completion_at` ET `scheduled_at` du followup
pending. Si `report_count > 0` : afficher *"Reportée X fois (5 max)"*.

### Affichage côté referrer

Si `recommendations.abandoned_by_pro_at IS NOT NULL` :
- Liste des recos : badge gris-orangé `Abandonnée par le pro` à côté du statut habituel
- Détail de la reco : bandeau d'alerte clair :
  > Le professionnel n'a pas donné suite à cette recommandation. Vous pouvez la
  > transférer à un autre pro ou l'archiver.
  > [ Transférer à un autre pro ] [ Archiver ]
- Les actions réutilisent l'infra `transfer_recommendation` existante

### Page admin `/gestion-reseau/recommandations/[id]`

Ajouter une section "Historique des relances" avec timeline des followups (envoyés,
reportés, cancel + raison) — utile pour le SAV.

## Conditions d'arrêt et edge cases

### Annulations (cancel des followups pending)

| Événement | Source | `cancel_reason` |
|-----------|--------|-----------------|
| Étape suivante complétée (UI ou bouton "C'est fait") | Trigger SQL | `next_step_done` |
| Reco refusée | Server Action `refuseRecommendation` | `reco_refused` |
| Reco transférée | Route `transfer_recommendation` | `reco_transferred` |
| Reco supprimée | `ON DELETE CASCADE` | — |
| Cycle de 3 atteint sans action | Cron worker | `pro_abandoned` |
| Pro inactif (profil supprimé / company `deleted_at`) | Cron worker (vérif live) | `pro_inactive` |

### Edge cases

1. **Pro complète l'étape suivante via UI** — trigger cancel les pending. Bouton "C'est fait" cliqué a posteriori → idempotent.
2. **Pro reporte 5 fois** — au 6e envoi planifié, le worker enclenche le cycle sans accepter de nouveau report. À la 3e relance → `abandoned_by_pro_at`.
3. **Étape 2 acceptée puis reco refusée 2h après** — le followup créé reste pending mais sera cancel au prochain run cron. Idempotent.
4. **Étape 5 sans `expected_completion_at`** — le trigger ne crée pas de followup. UI bloque, mais cas de robustesse pour recos historiques / API admin.
5. **Recos antérieures au déploiement** — pas de backfill. On évite une vague de relances sur des recos peut-être déjà oubliées.
6. **Token expiré (>30j)** — page "Ce lien a expiré, accédez à votre tableau de bord".
7. **Token d'un followup déjà cancel/sent** — page "Cette relance a déjà été traitée".
8. **Pro qui clique "C'est fait" d'un vieil email étape 2 alors qu'il est rendu à l'étape 5** — l'étape 3 est déjà complétée, action idempotente, pas d'effet.
9. **Auto-recommandation** — le user est referrer ET pro. Les relances sont quand même envoyées (pas d'exception pour rester simple). Cas marginal.
10. **Mode démo** — vérifier en implémentation s'il existe un flag `is_demo` sur les recos ; si oui, le worker doit filtrer ces recos. Sinon, accepter ce cas (faible volume).
11. **Fuseau horaire** — `timestamptz` partout, comparaison côté DB, pas de souci.
12. **Email queue saturée** — la table `recommendation_followups` est indépendante : `sent` = "queued dans email_queue", l'envoi SMTP réel se fait avec ses propres retries.

## Documentation à mettre à jour

| Fichier | Modification |
|---------|--------------|
| `CLAUDE.md` | Section "Workflow de recommandation" → 7 étapes ; nouvelle section "Relances automatiques pro" |
| `doc/architecture.md` | Ajouter `recommendation_followups` (FEATURE) + cron worker (CORE) + relations vers `notify-pro-followup` |
| `doc/database.md` | Schéma de `recommendation_followups` + colonnes `expected_completion_at`, `abandoned_by_pro_at` + trigger `handle_recommendation_step_completion` |
| `doc/api-routes.md` | `POST /api/recommendations/process-followups` + `GET /api/recommendations/followup-action` + pages publiques |

### Schéma textuel à intégrer dans `CLAUDE.md`

```
Étape 1 : Recommandation reçue
   │
   ▼
Étape 2 : Acceptée par le pro ─────────────► [Relance auto T+24h, cycle 3×]
   │                                         ✅ C'est fait → étape 3
   ▼                                         📅 Reporter (max 5)
Étape 3 : Contact établi                     ❌ Abandon → reco refusée
   │
   ▼
Étape 4 : Rendez-vous fixé ────────────────► [Relance auto T+72h, cycle 3×]
   │
   ▼
Étape 5 : Devis soumis ────────────────────► [Relance auto à expected_completion_at, cycle 3×]
   │  (champ obligatoire : délai estimé)
   ▼
Étape 6 : Travaux + paiement (déclenche commissions MLM)
   │
   ▼
Étape 7 : Affaire terminée
```

## Variables d'environnement nouvelles

| Variable | Description |
|----------|-------------|
| `FOLLOWUP_ACTION_SECRET` | Clé HMAC pour signer les tokens d'action email (32+ bytes random) |

`CRON_SECRET` existe déjà (utilisé par `process-queue`).

## Cron à enregistrer côté infra

```
*/15 * * * *  curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
              https://winelio.app/api/recommendations/process-followups
```

À ajouter à côté des crons existants (`process-queue`, `stripe/cron-reminders`,
`bugs/imap-poll`).

## Limites et choix YAGNI explicites

- **Pas de transfert auto** après abandon — le referrer décide manuellement
- **Pas de tracking d'ouverture** sur les relances — on n'en a pas besoin pour le moment
- **Pas de notif push** — uniquement email pour le pro (les push sont gérés ailleurs si jamais)
- **Pas de personnalisation** des délais par catégorie — fixes 24h/72h, le pro ajuste à l'étape 5
- **Pas de backfill** sur les recos antérieures
