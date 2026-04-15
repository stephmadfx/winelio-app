# Stripe — Paiement de commission par le professionnel

## Date
2026-04-15

## Contexte

Dans le modèle économique Winelio, quand une recommandation aboutit (le client paie le professionnel), le professionnel doit reverser une commission à la plateforme. Cette commission est ensuite distribuée automatiquement à tout le réseau MLM (référent, niveaux 1-5, bonus affiliation, cagnotte Winelio).

Actuellement, les commissions sont créées par un déclencheur admin à l'étape 6 (QUOTE_VALIDATED). Ce design remplace ce déclencheur par un paiement Stripe réel du professionnel, déclenché automatiquement à l'étape 7.

## Flux complet

```
Admin valide step 7 (PAYMENT_RECEIVED)
        ↓
Server Action appelle /api/stripe/create-checkout
        ↓
Stripe Checkout Session créée (montant = deal × commission_rate%)
Session sauvegardée en DB (stripe_payment_sessions, status='pending')
        ↓
Email au professionnel → lien Stripe Checkout

J+2 (48h) : session toujours 'pending'
        → relance email au professionnel

J+4 (48h après relance) : toujours 'pending'
        → email d'alerte au client (contact) ET au référent

Professionnel paie → webhook Stripe (checkout.session.completed)
        ↓
createCommissions() → distribution MLM automatique
Session mise à jour : status='paid', paid_at=now()
```

## Montant de la commission

`commission_amount = deal_amount × (commission_rate / 100)`

Le `commission_rate` est défini dans le `compensation_plan` associé à la recommandation (ou le plan par défaut). Ce montant total est ce que le professionnel paie — il est ensuite distribué intégralement au réseau MLM selon la répartition existante (60% référent, 4%×5 niveaux, 1% affiliation, 1% cashback Wins, 14% cagnotte Winelio).

## Changement clé dans la logique existante

**Avant** : `advanceRecommendationStep()` à `order_index === 6` → `createCommissions()`
**Après** : `advanceRecommendationStep()` à `order_index === 7` → création Checkout Session Stripe → `createCommissions()` uniquement via webhook Stripe confirmé

L'étape 6 ne déclenche plus rien côté commissions.

## Table DB — `stripe_payment_sessions`

```sql
CREATE TABLE winelio.stripe_payment_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id   UUID NOT NULL REFERENCES winelio.recommendations(id),
  stripe_session_id   TEXT NOT NULL UNIQUE,
  amount              NUMERIC(10,2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'expired')),
  reminder_sent_at    TIMESTAMPTZ,
  alert_sent_at       TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule session 'pending' par recommandation
CREATE UNIQUE INDEX uq_stripe_session_pending
  ON winelio.stripe_payment_sessions (recommendation_id)
  WHERE status = 'pending';
```

Si `create-checkout` est appelé alors qu'une session `pending` existe déjà pour cette recommandation, la route retourne l'URL Stripe existante sans en créer une nouvelle (idempotence).

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/app/api/stripe/create-checkout/route.ts` | Crée la Checkout Session Stripe, insère en DB, envoie l'email au pro |
| `src/app/api/stripe/webhook/route.ts` | Reçoit `checkout.session.completed`, appelle `createCommissions()`, met à jour la session |
| `src/app/api/stripe/cron-reminders/route.ts` | Vérifie les sessions en attente (toutes les heures), envoie relances J+2 et alertes J+4 |
| `src/app/api/email/commission-payment/route.ts` | 3 templates email : lien paiement, relance pro, alerte client+référent |
| `supabase/migrations/20260415_stripe_payment_sessions.sql` | Migration DB |

## Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `src/app/gestion-reseau/actions.ts` | `advanceRecommendationStep()` : déplacer le déclencheur de `order_index === 6` à `order_index === 7`, appeler create-checkout au lieu de createCommissions() |
| `src/lib/commission.ts` | Aucun changement — `createCommissions()` reste inchangée, appelée depuis le webhook |

## Templates email

### 1. Lien de paiement (au pro — J+0)
- Objet : "Votre commission Winelio — [Nom client] — [Montant]€"
- Contenu : résumé de la recommandation, montant dû, bouton CTA "Payer ma commission →" (lien Stripe)
- Charte visuelle standard Winelio (table HTML, gradient orange)

### 2. Relance (au pro — J+2)
- Objet : "Rappel — Commission en attente [Montant]€"
- Contenu : rappel + nouveau bouton CTA avec le même lien Stripe

### 3. Alerte (au client + référent — J+4)
- Objet : "Information — Commission non réglée"
- Contenu : information neutre que la commission liée à leur dossier n'a pas été réglée, invitation à contacter le support

## Sécurité

- **Webhook Stripe** : vérifié via `stripe.webhooks.constructEvent()` + `STRIPE_WEBHOOK_SECRET` — tout webhook non signé → 400
- **Cron** : route protégée par header `Authorization: Bearer CRON_SECRET`
- **Idempotence** : avant `createCommissions()`, vérifier `status !== 'paid'` sur la session ET la garde existante dans `createCommissions()` (count > 0)
- **Stripe retente** les webhooks échoués automatiquement jusqu'à 3 jours → la garde idempotente protège contre les doublons

## Variables d'environnement (à ajouter dans Coolify)

```
STRIPE_SECRET_KEY        sk_test_...   (puis sk_live_... en prod)
STRIPE_WEBHOOK_SECRET    whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  pk_test_...
CRON_SECRET              <chaîne aléatoire sécurisée>
```

## Hors périmètre

- Interface admin de suivi des paiements Stripe (dashboard Stripe suffit pour l'instant)
- Remboursements Stripe
- Paiements échelonnés ou en plusieurs fois
- Interface pro dans `/recommendations/[id]` pour voir l'état du paiement (phase 2)
