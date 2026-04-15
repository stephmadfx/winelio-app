# Stripe Commission Payment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand l'admin valide l'étape 7 (PAYMENT_RECEIVED), le professionnel reçoit automatiquement un email avec un lien Stripe Checkout pour payer sa commission ; le paiement déclenche la distribution MLM automatique.

**Architecture:** Un helper lib `stripe-checkout.ts` est appelé depuis la server action existante. Le webhook Stripe appelle `createCommissions()`. Un endpoint cron vérifié par secret envoie les relances J+2 et les alertes J+4.

**Tech Stack:** stripe (npm), nodemailer (existant), Supabase Admin (existant), Next.js 15 App Router, GitHub Actions (cron)

---

## Fichiers créés / modifiés

| Statut | Fichier | Rôle |
|--------|---------|------|
| CRÉER | `src/lib/stripe.ts` | Client Stripe singleton |
| CRÉER | `supabase/migrations/20260415_stripe_payment_sessions.sql` | Table DB |
| CRÉER | `src/lib/notify-commission-payment.ts` | 3 fonctions email (lien, relance, alerte) |
| CRÉER | `src/lib/stripe-checkout.ts` | `createStripeCheckoutSession()` — logique métier |
| CRÉER | `src/app/api/stripe/webhook/route.ts` | Webhook Stripe → commissions |
| CRÉER | `src/app/api/stripe/cron-reminders/route.ts` | Cron relances/alertes |
| MODIFIER | `src/app/gestion-reseau/actions.ts` | Step 7 → checkout, retirer trigger step 6 |
| MODIFIER | `.github/workflows/ci.yml` (ou nouveau fichier) | Cron GitHub Actions toutes les heures |

---

## Task 1 — Installer Stripe + créer le client singleton

**Files:**
- Create: `src/lib/stripe.ts`

- [ ] **Step 1.1 — Installer le package stripe**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm install stripe
```

Résultat attendu : `added 1 package` (ou mise à jour dans `package.json`).

- [ ] **Step 1.2 — Créer `src/lib/stripe.ts`**

```typescript
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(key ?? "sk_test_placeholder", {
  apiVersion: "2024-12-18.acacia",
});
```

> Note : vérifier la version exacte de l'API avec `npm info stripe` après installation et ajuster `apiVersion` si nécessaire. Le package affichera la version supportée dans les types TypeScript.

- [ ] **Step 1.3 — Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : build réussi, pas d'erreur TypeScript sur `src/lib/stripe.ts`.

- [ ] **Step 1.4 — Commit**

```bash
git add package.json package-lock.json src/lib/stripe.ts
git commit -m "feat(stripe): install stripe package and singleton client"
```

---

## Task 2 — Migration DB : table `stripe_payment_sessions`

**Files:**
- Create: `supabase/migrations/20260415_stripe_payment_sessions.sql`

- [ ] **Step 2.1 — Créer la migration**

Créer le fichier `supabase/migrations/20260415_stripe_payment_sessions.sql` :

```sql
-- Table de suivi des sessions de paiement Stripe pour les commissions
CREATE TABLE IF NOT EXISTS winelio.stripe_payment_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount            NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'expired')),
  reminder_sent_at  TIMESTAMPTZ,
  alert_sent_at     TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule session 'pending' par recommandation (idempotence)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_session_pending
  ON winelio.stripe_payment_sessions (recommendation_id)
  WHERE status = 'pending';

-- Index pour le cron (recherche par status + dates)
CREATE INDEX IF NOT EXISTS idx_stripe_sessions_status_dates
  ON winelio.stripe_payment_sessions (status, created_at, reminder_sent_at, alert_sent_at)
  WHERE status = 'pending';

-- RLS : accessible uniquement via service_role (supabaseAdmin)
ALTER TABLE winelio.stripe_payment_sessions ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2.2 — Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_stripe_payment_sessions.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_stripe_payment_sessions.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/20260415_stripe_payment_sessions.sql"
```

Résultat attendu :
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
```

- [ ] **Step 2.3 — Vérifier la table**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='winelio' AND table_name='stripe_payment_sessions' ORDER BY ordinal_position;\""
```

Résultat attendu : 9 colonnes listées (id, recommendation_id, stripe_session_id, amount, status, reminder_sent_at, alert_sent_at, paid_at, created_at).

- [ ] **Step 2.4 — Commit**

```bash
git add supabase/migrations/20260415_stripe_payment_sessions.sql
git commit -m "feat(db): add stripe_payment_sessions table"
```

---

## Task 3 — Emails commission : `src/lib/notify-commission-payment.ts`

**Files:**
- Create: `src/lib/notify-commission-payment.ts`

Ce fichier suit exactement le pattern de `src/lib/notify-new-referral.ts` : transporter nodemailer en module scope, fonctions exportées par type d'email.

- [ ] **Step 3.1 — Créer `src/lib/notify-commission-payment.ts`**

```typescript
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM = `"Winelio" <${process.env.SMTP_USER || "support@winelio.app"}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

// ─── Helpers HTML ─────────────────────────────────────────────────────────────

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr>
        <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
            <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:24px;">&nbsp;</td></tr>
            <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          ${content}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p>
          <p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
            <a href="${url}" style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">${label}</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

function infoBlock(content: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
      ${content}
    </td></tr>
  </table>`;
}

// ─── Email 1 : Lien de paiement (J+0) ─────────────────────────────────────────

function buildPaymentLinkEmail(
  proFirstName: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): string {
  const amountStr = amount.toFixed(2).replace(".", ",");
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">💳</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Commission à régler</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    ${infoBlock(`
      <p style="margin:0;color:#2D3436;font-size:15px;font-weight:600;">Client : ${he(clientName)}</p>
      <p style="margin:8px 0 0;color:#636E72;font-size:14px;">Le paiement de votre client a été confirmé. Voici la commission Winelio à régler :</p>
      <p style="margin:12px 0 0;color:#FF6B35;font-size:24px;font-weight:800;">${amountStr}&nbsp;€</p>
    `)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:13px;text-align:center;margin:0 0 20px;">
      Ce lien est valable <strong style="color:#2D3436;">24 heures</strong>. Un rappel vous sera envoyé si nécessaire.
    </p>
    ${ctaButton("Payer ma commission →", he(checkoutUrl))}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#999;font-size:11px;text-align:center;margin:0;">
      Des questions ? Contactez-nous à <a href="mailto:support@winelio.app" style="color:#FF6B35;">support@winelio.app</a>
    </p>`;

  return emailShell(content);
}

// ─── Email 2 : Relance (J+2) ───────────────────────────────────────────────────

function buildReminderEmail(
  proFirstName: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): string {
  const amountStr = amount.toFixed(2).replace(".", ",");
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:#FFF5F0;border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">⏰</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Rappel — Commission en attente</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    ${infoBlock(`
      <p style="margin:0;color:#2D3436;font-size:15px;font-weight:600;">Client : ${he(clientName)}</p>
      <p style="margin:8px 0 0;color:#636E72;font-size:14px;">Votre commission Winelio n'a pas encore été réglée.</p>
      <p style="margin:12px 0 0;color:#FF6B35;font-size:24px;font-weight:800;">${amountStr}&nbsp;€</p>
    `)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:13px;text-align:center;margin:0 0 20px;">
      Merci de procéder au règlement dès que possible pour maintenir votre accès à la plateforme.
    </p>
    ${ctaButton("Payer ma commission →", he(checkoutUrl))}`;

  return emailShell(content);
}

// ─── Email 3 : Alerte client + référent (J+4) ─────────────────────────────────

function buildAlertEmail(recipientFirstName: string): string {
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:#FFF5F0;border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">ℹ️</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Information — Commission non réglée</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(recipientFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Nous vous informons que la commission liée à votre dossier n'a pas encore été réglée par le professionnel concerné.
      Notre équipe prend en charge le suivi de cette situation.
    </p>
    <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Si vous avez des questions, n'hésitez pas à contacter notre support.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="background:#F8F9FA;border-radius:12px;padding:12px 24px;">
              <a href="mailto:support@winelio.app" style="color:#FF6B35;font-size:14px;font-weight:600;text-decoration:none;">support@winelio.app</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>`;

  return emailShell(content);
}

// ─── Fonctions exportées ───────────────────────────────────────────────────────

export async function sendCommissionPaymentEmail(
  proId: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): Promise<void> {
  const [profileResult, authResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name").eq("id", proId).single(),
    supabaseAdmin.auth.admin.getUserById(proId),
  ]);

  const firstName = profileResult.data?.first_name || "Professionnel";
  const email = authResult.data?.user?.email;
  if (!email) return;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Commission Winelio — ${clientName} — ${amount.toFixed(2).replace(".", ",")} €`,
    html: buildPaymentLinkEmail(firstName, clientName, amount, checkoutUrl),
    text: `Bonjour ${firstName},\n\nVotre commission Winelio pour le client ${clientName} est de ${amount.toFixed(2)} €.\n\nRéglez-la ici : ${checkoutUrl}\n\n© 2026 Winelio`,
  });
}

export async function sendCommissionReminderEmail(
  proId: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): Promise<void> {
  const [profileResult, authResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name").eq("id", proId).single(),
    supabaseAdmin.auth.admin.getUserById(proId),
  ]);

  const firstName = profileResult.data?.first_name || "Professionnel";
  const email = authResult.data?.user?.email;
  if (!email) return;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Rappel — Commission en attente ${amount.toFixed(2).replace(".", ",")} €`,
    html: buildReminderEmail(firstName, clientName, amount, checkoutUrl),
    text: `Bonjour ${firstName},\n\nRappel : votre commission Winelio de ${amount.toFixed(2)} € pour ${clientName} n'a pas encore été réglée.\n\nLien de paiement : ${checkoutUrl}\n\n© 2026 Winelio`,
  });
}

export async function sendCommissionAlertEmails(
  contactId: string,
  referrerId: string
): Promise<void> {
  // Récupère email + prénom du contact (client) et du référent
  const [contactProfile, referrerProfile] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name, id").eq("id", contactId).maybeSingle(),
    supabaseAdmin.from("profiles").select("first_name").eq("id", referrerId).single(),
  ]);

  // Le contact peut ne pas avoir de profil (créé depuis contacts, pas forcément un user)
  // Récupère l'email du contact depuis la table contacts directement
  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("email, first_name, last_name")
    .eq("id", contactId)
    .maybeSingle();

  const referrerAuth = await supabaseAdmin.auth.admin.getUserById(referrerId);
  const referrerEmail = referrerAuth.data?.user?.email;
  const referrerFirstName = referrerProfile.data?.first_name || "Membre";

  const recipients: Array<{ email: string; firstName: string }> = [];

  if (contactRow?.email) {
    recipients.push({
      email: contactRow.email,
      firstName: contactRow.first_name || "Client",
    });
  }
  if (referrerEmail) {
    recipients.push({ email: referrerEmail, firstName: referrerFirstName });
  }

  await Promise.allSettled(
    recipients.map(({ email, firstName }) =>
      transporter.sendMail({
        from: FROM,
        to: email,
        subject: "Information — Commission non réglée",
        html: buildAlertEmail(firstName),
        text: `Bonjour ${firstName},\n\nNous vous informons que la commission liée à votre dossier n'a pas encore été réglée. Notre équipe assure le suivi.\n\nContact : support@winelio.app\n\n© 2026 Winelio`,
      })
    )
  );
}
```

- [ ] **Step 3.2 — Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : pas d'erreur TypeScript.

- [ ] **Step 3.3 — Commit**

```bash
git add src/lib/notify-commission-payment.ts
git commit -m "feat(email): add commission payment notification helpers (3 types)"
```

---

## Task 4 — Logique checkout : `src/lib/stripe-checkout.ts`

**Files:**
- Create: `src/lib/stripe-checkout.ts`

Cette fonction est appelée depuis la server action. Elle crée la Checkout Session Stripe, sauvegarde en DB, et envoie l'email au pro.

- [ ] **Step 4.1 — Créer `src/lib/stripe-checkout.ts`**

```typescript
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCommissionPaymentEmail } from "@/lib/notify-commission-payment";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

/**
 * Crée une Stripe Checkout Session pour la commission d'une recommandation.
 * Idempotente : retourne l'URL existante si une session pending existe déjà.
 * Appelée depuis advanceRecommendationStep() quand order_index === 7.
 */
export async function createStripeCheckoutSession(
  recommendationId: string
): Promise<string> {
  // ── 1. Vérification idempotente ──────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("stripe_session_id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    const existingSession = await stripe.checkout.sessions.retrieve(
      existing.stripe_session_id
    );
    if (existingSession.status !== "expired" && existingSession.url) {
      return existingSession.url;
    }
    // Session expirée → marquer expired et en créer une nouvelle
    await supabaseAdmin
      .from("stripe_payment_sessions")
      .update({ status: "expired" })
      .eq("stripe_session_id", existing.stripe_session_id);
  }

  // ── 2. Récupérer la recommandation ───────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select(
      "id, amount, professional_id, referrer_id, compensation_plan_id, contact:contacts(first_name, last_name)"
    )
    .eq("id", recommendationId)
    .single();

  if (!reco?.amount) {
    throw new Error(`Recommandation ${recommendationId} sans montant`);
  }

  // ── 3. Résoudre le plan de commission ────────────────────────────────────────
  let commissionRate = 10; // taux par défaut
  if (reco.compensation_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("id", reco.compensation_plan_id)
      .single();
    if (plan) commissionRate = plan.commission_rate;
  } else {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    if (defaultPlan) commissionRate = defaultPlan.commission_rate;
  }

  const commissionAmount = Math.round(reco.amount * (commissionRate / 100) * 100) / 100;

  // ── 4. Récupérer l'email du professionnel ────────────────────────────────────
  const { data: proAuth } = await supabaseAdmin.auth.admin.getUserById(
    reco.professional_id
  );
  const proEmail = proAuth?.user?.email;

  // ── 5. Construire le nom du client ───────────────────────────────────────────
  const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
  const clientName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
    : "Client";

  // ── 6. Créer la Stripe Checkout Session ──────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(proEmail ? { customer_email: proEmail } : {}),
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Commission Winelio — ${clientName}`,
            description: `Recommandation #${recommendationId.slice(0, 8)} · Montant du deal : ${reco.amount} €`,
          },
          unit_amount: Math.round(commissionAmount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      recommendation_id: recommendationId,
      professional_id: reco.professional_id,
    },
    success_url: `${APP_URL}?commission=paid`,
    cancel_url: `${APP_URL}?commission=cancelled`,
    // Stripe maximum : 24h (86400s)
    expires_at: Math.floor(Date.now() / 1000) + 86400,
  });

  if (!session.url) throw new Error("Stripe n'a pas retourné d'URL de checkout");

  // ── 7. Sauvegarder en DB ─────────────────────────────────────────────────────
  await supabaseAdmin.from("stripe_payment_sessions").insert({
    recommendation_id: recommendationId,
    stripe_session_id: session.id,
    amount: commissionAmount,
  });

  // ── 8. Envoyer l'email au professionnel ──────────────────────────────────────
  await sendCommissionPaymentEmail(
    reco.professional_id,
    clientName,
    commissionAmount,
    session.url
  );

  return session.url;
}
```

- [ ] **Step 4.2 — Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : pas d'erreur TypeScript.

- [ ] **Step 4.3 — Commit**

```bash
git add src/lib/stripe-checkout.ts
git commit -m "feat(stripe): add createStripeCheckoutSession helper"
```

---

## Task 5 — Webhook Stripe : `src/app/api/stripe/webhook/route.ts`

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

Le webhook reçoit `checkout.session.completed` de Stripe, vérifie la signature, et déclenche la distribution des commissions.

- [ ] **Step 5.1 — Créer `src/app/api/stripe/webhook/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCommissions } from "@/lib/commission";
import { recalculateWallet } from "@/lib/wallet";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret non configuré" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const recommendationId = session.metadata?.recommendation_id;

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendation_id absent" }, { status: 400 });
  }

  // ── Idempotence : vérifier que la session n'est pas déjà payée ───────────────
  const { data: paymentSession } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, status, amount")
    .eq("stripe_session_id", session.id)
    .single();

  if (!paymentSession) {
    return NextResponse.json({ error: "Session introuvable en DB" }, { status: 404 });
  }

  if (paymentSession.status === "paid") {
    return NextResponse.json({ received: true, skipped: "already_paid" });
  }

  // ── Récupérer la recommandation ──────────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id, professional_id, amount, compensation_plan_id")
    .eq("id", recommendationId)
    .single();

  if (!reco?.amount) {
    return NextResponse.json({ error: "Recommandation introuvable ou sans montant" }, { status: 404 });
  }

  // ── Créer et distribuer les commissions ──────────────────────────────────────
  await createCommissions(
    reco.id,
    reco.referrer_id,
    reco.professional_id,
    reco.amount,
    reco.compensation_plan_id ?? null
  );

  // Recalculer les wallets des bénéficiaires
  const { data: commissions } = await supabaseAdmin
    .from("commission_transactions")
    .select("user_id")
    .eq("recommendation_id", reco.id);

  const uniqueUsers = [...new Set((commissions ?? []).map((c) => c.user_id))];
  await Promise.all(uniqueUsers.map((userId) => recalculateWallet(userId)));

  // ── Marquer la session comme payée ───────────────────────────────────────────
  await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentSession.id);

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5.2 — Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : pas d'erreur TypeScript.

- [ ] **Step 5.3 — Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(stripe): add webhook handler — distributes commissions on payment"
```

---

## Task 6 — Cron relances : `src/app/api/stripe/cron-reminders/route.ts`

**Files:**
- Create: `src/app/api/stripe/cron-reminders/route.ts`

Route appelée toutes les heures. Elle vérifie les sessions pending et envoie relances J+2 puis alertes J+4. Les sessions Stripe expirées sont recréées avant l'envoi du rappel.

- [ ] **Step 6.1 — Créer `src/app/api/stripe/cron-reminders/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendCommissionReminderEmail,
  sendCommissionAlertEmails,
} from "@/lib/notify-commission-payment";

const REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;  // 48h
const ALERT_DELAY_MS    = 48 * 60 * 60 * 1000;  // 48h après la relance

export async function GET(req: Request) {
  // ── Auth cron ────────────────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let reminders = 0;
  let alerts = 0;

  // ── 1. Relances J+2 ──────────────────────────────────────────────────────────
  const reminderBefore = new Date(now.getTime() - REMINDER_DELAY_MS).toISOString();
  const { data: toRemind } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, stripe_session_id, amount, recommendation_id")
    .eq("status", "pending")
    .is("reminder_sent_at", null)
    .lt("created_at", reminderBefore);

  for (const session of toRemind ?? []) {
    try {
      // Récupérer ou recréer la Checkout Session Stripe
      const stripeSession = await stripe.checkout.sessions.retrieve(session.stripe_session_id);
      let checkoutUrl = stripeSession.url;

      if (stripeSession.status === "expired" || !checkoutUrl) {
        // Recréer une session Stripe à partir des données DB
        const { data: reco } = await supabaseAdmin
          .from("recommendations")
          .select("amount, professional_id, compensation_plan_id, contact:contacts(first_name, last_name)")
          .eq("id", session.recommendation_id)
          .single();

        if (!reco?.amount) continue;

        const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
        const clientName = contact
          ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
          : "Client";

        const newSession = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: { name: `Commission Winelio — ${clientName} (relance)` },
                unit_amount: Math.round(session.amount * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            recommendation_id: session.recommendation_id,
            professional_id: reco.professional_id,
          },
          success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app"}?commission=paid`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app"}?commission=cancelled`,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        });

        checkoutUrl = newSession.url;
        // Mettre à jour le stripe_session_id en DB
        await supabaseAdmin
          .from("stripe_payment_sessions")
          .update({ stripe_session_id: newSession.id })
          .eq("id", session.id);
      }

      if (!checkoutUrl) continue;

      // Récupérer les données nécessaires pour l'email
      const { data: reco } = await supabaseAdmin
        .from("recommendations")
        .select("professional_id, contact:contacts(first_name, last_name)")
        .eq("id", session.recommendation_id)
        .single();

      if (!reco) continue;

      const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
      const clientName = contact
        ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
        : "Client";

      await sendCommissionReminderEmail(
        reco.professional_id,
        clientName,
        session.amount,
        checkoutUrl
      );

      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", session.id);

      reminders++;
    } catch (err) {
      console.error(`[cron-reminders] Erreur session ${session.id}:`, err);
    }
  }

  // ── 2. Alertes J+4 (48h après la relance) ────────────────────────────────────
  const alertBefore = new Date(now.getTime() - ALERT_DELAY_MS).toISOString();
  const { data: toAlert } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, recommendation_id")
    .eq("status", "pending")
    .is("alert_sent_at", null)
    .not("reminder_sent_at", "is", null)
    .lt("reminder_sent_at", alertBefore);

  for (const session of toAlert ?? []) {
    try {
      const { data: reco } = await supabaseAdmin
        .from("recommendations")
        .select("referrer_id, contact_id")
        .eq("id", session.recommendation_id)
        .single();

      if (!reco) continue;

      await sendCommissionAlertEmails(reco.contact_id, reco.referrer_id);

      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({ alert_sent_at: now.toISOString() })
        .eq("id", session.id);

      alerts++;
    } catch (err) {
      console.error(`[cron-reminders] Erreur alerte ${session.id}:`, err);
    }
  }

  return NextResponse.json({ reminders, alerts, timestamp: now.toISOString() });
}
```

- [ ] **Step 6.2 — Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : pas d'erreur TypeScript.

> Note : vérifier le nom exact de la FK vers `contacts` dans la table `recommendations` avant d'écrire le code :
> ```bash
> sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
>   "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
>   -c \"SELECT column_name FROM information_schema.columns WHERE table_schema='winelio' AND table_name='recommendations' ORDER BY ordinal_position;\""
> ```
> Le nom peut être `contact_id` ou différent. Ajuster `.select("referrer_id, contact_id")` en conséquence.

- [ ] **Step 6.3 — Commit**

```bash
git add src/app/api/stripe/cron-reminders/route.ts
git commit -m "feat(stripe): add cron-reminders endpoint (J+2 relance, J+4 alerte)"
```

---

## Task 7 — Modifier `actions.ts` : step 7 → checkout, retirer step 6

**Files:**
- Modify: `src/app/gestion-reseau/actions.ts`

Deux changements : (1) supprimer le bloc `order_index === 6` qui crée les commissions, (2) ajouter un bloc `order_index === 7` qui appelle `createStripeCheckoutSession`.

- [ ] **Step 7.1 — Modifier `src/app/gestion-reseau/actions.ts`**

Remplacer le bloc entier de la fonction `advanceRecommendationStep` (lignes 23-69) par :

```typescript
export async function advanceRecommendationStep(
  recommendationId: string,
  stepId: string
) {
  await assertSuperAdmin();

  const { error: stepError } = await supabaseAdmin
    .from("recommendation_steps")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", stepId);

  if (stepError) throw new Error(`Erreur mise à jour étape: ${stepError.message}`);

  // Récupérer l'order_index de l'étape
  const { data: stepRow } = await supabaseAdmin
    .from("recommendation_steps")
    .select("step:steps(order_index)")
    .eq("id", stepId)
    .single();

  const stepData = Array.isArray(stepRow?.step) ? stepRow.step[0] : stepRow?.step;
  const orderIndex = (stepData as { order_index: number } | null | undefined)?.order_index;

  // Step 7 (PAYMENT_RECEIVED) → déclencher le paiement Stripe de la commission
  if (orderIndex === 7) {
    const { data: reco } = await supabaseAdmin
      .from("recommendations")
      .select("id, amount")
      .eq("id", recommendationId)
      .single();

    if (reco?.amount) {
      try {
        await createStripeCheckoutSession(recommendationId);
      } catch (err) {
        console.error(`[advanceRecommendationStep] Erreur création checkout Stripe:`, err);
        // Ne pas faire échouer l'avancement de l'étape si Stripe échoue
      }
    }
  }

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}
```

Et mettre à jour les imports en haut du fichier — remplacer :
```typescript
import { createCommissions } from "@/lib/commission";
import { recalculateWallet } from "@/lib/wallet";
```

Par :
```typescript
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
```

(`recalculateWallet` reste utilisé dans `adjustCommission` → vérifier qu'il est gardé si nécessaire)

- [ ] **Step 7.2 — Vérifier les imports restants dans actions.ts**

Après modification, vérifier que `recalculateWallet` est toujours importé si utilisé ailleurs dans le fichier (il l'est dans `adjustCommission`, `validateWithdrawal`, etc.). Garder cet import.

Import final en haut de `actions.ts` :
```typescript
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recalculateWallet } from "@/lib/wallet";
import { COMMISSION_TYPE, COMMISSION_STATUS, WITHDRAWAL_STATUS } from "@/lib/constants";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
```

- [ ] **Step 7.3 — Vérifier le build**

```bash
npm run build 2>&1 | tail -30
```

Résultat attendu : build réussi, pas d'erreur TypeScript.

- [ ] **Step 7.4 — Commit**

```bash
git add src/app/gestion-reseau/actions.ts
git commit -m "feat(stripe): wire step 7 to Stripe checkout, remove step 6 commission trigger"
```

---

## Task 8 — Variables d'environnement + cron GitHub Actions

**Files:**
- Create ou Modify: `.github/workflows/cron-stripe-reminders.yml`

- [ ] **Step 8.1 — Ajouter les variables d'environnement en local**

Créer / mettre à jour `.env.local` (ne jamais commiter ce fichier) :

```bash
# Stripe (mode test)
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_ICI
STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET_ICI
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_VOTRE_CLE_ICI

# Cron secret (générer une chaîne aléatoire)
CRON_SECRET=remplacez_par_une_chaine_aleatoire_32_chars
```

Pour obtenir ces clés :
1. Se connecter sur https://dashboard.stripe.com/test/apikeys
2. Copier la **clé secrète** (`sk_test_...`) et la **clé publique** (`pk_test_...`)
3. Pour `STRIPE_WEBHOOK_SECRET` : voir Step 9.1 (Stripe CLI)

Pour générer un `CRON_SECRET` aléatoire :
```bash
openssl rand -hex 32
```

- [ ] **Step 8.2 — Créer le workflow GitHub Actions pour le cron**

Créer `.github/workflows/cron-stripe-reminders.yml` :

```yaml
name: Stripe Commission Reminders

on:
  schedule:
    # Toutes les heures (minute 0)
    - cron: '0 * * * *'
  workflow_dispatch:  # Déclenchement manuel pour tester

jobs:
  run-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call cron-reminders endpoint
        run: |
          curl -s -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.APP_URL }}/api/stripe/cron-reminders" \
            | jq .
```

- [ ] **Step 8.3 — Ajouter les secrets dans GitHub**

Dans GitHub → Settings → Secrets and variables → Actions → New repository secret :
- `CRON_SECRET` : la même valeur que dans Coolify
- `APP_URL` : `https://dev2.winelio.app` (branche dev) ou `https://winelio.app` (prod)

- [ ] **Step 8.4 — Ajouter les variables dans Coolify**

Dans le dashboard Coolify, pour l'app `dev2.winelio.app`, ajouter :
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
CRON_SECRET=<même valeur que GitHub secret>
```

- [ ] **Step 8.5 — Commit**

```bash
git add .github/workflows/cron-stripe-reminders.yml
git commit -m "feat(ci): add hourly cron for Stripe commission reminders"
```

---

## Task 9 — Test end-to-end avec Stripe CLI

- [ ] **Step 9.1 — Installer Stripe CLI et écouter les webhooks**

Si Stripe CLI n'est pas installé :
```bash
brew install stripe/stripe-cli/stripe
stripe login
```

Dans un terminal séparé, lancer l'écoute des webhooks :
```bash
stripe listen --forward-to localhost:3002/api/stripe/webhook
```

La CLI affiche : `> Ready! Your webhook signing secret is whsec_XXXX`

Copier cette valeur dans `.env.local` :
```
STRIPE_WEBHOOK_SECRET=whsec_XXXX
```

Puis redémarrer le serveur dev :
```bash
pm2 restart winelio-dev
```

- [ ] **Step 9.2 — Démarrer le serveur dev**

```bash
pm2 list
# Si winelio-dev n'apparaît pas :
pm2 start "npm run dev" --name winelio-dev
```

Vérifier que le serveur tourne : `curl -s http://localhost:3002 | head -5`

- [ ] **Step 9.3 — Vérifier le webhook avec un event test Stripe**

Dans un second terminal :
```bash
stripe trigger checkout.session.completed
```

Dans les logs du terminal Stripe CLI, vérifier :
```
POST http://localhost:3002/api/stripe/webhook [200]
```

Dans les logs PM2 :
```bash
pm2 logs winelio-dev --lines 20
```

Pas d'erreur attendue.

- [ ] **Step 9.4 — Tester le cron en local**

```bash
curl -s -X GET \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  "http://localhost:3002/api/stripe/cron-reminders" \
  | jq .
```

Résultat attendu :
```json
{ "reminders": 0, "alerts": 0, "timestamp": "2026-04-15T..." }
```

- [ ] **Step 9.5 — Test complet : avancer step 7 et vérifier l'email**

1. Dans le backoffice `/gestion-reseau/recommandations`, prendre une recommandation avec un montant (`amount > 0`) et dont le step 7 n'est pas encore complété.
2. Cliquer "Valider" sur le step 7 (PAYMENT_RECEIVED).
3. Vérifier dans les logs PM2 qu'il n'y a pas d'erreur :
   ```bash
   pm2 logs winelio-dev --lines 30
   ```
4. Vérifier en DB que la session a bien été créée :
   ```bash
   sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
     "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
     -c \"SELECT id, amount, status, created_at FROM winelio.stripe_payment_sessions ORDER BY created_at DESC LIMIT 1;\""
   ```
   Résultat attendu : 1 ligne avec `status = 'pending'`.
5. Vérifier que le professionnel a reçu l'email (vérifier la boîte `support@winelio.app` ou une boîte test).

- [ ] **Step 9.6 — Simuler un paiement réussi**

Dans le terminal Stripe CLI :
```bash
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.recommendation_id=RECOMMANDATION_UUID_ICI
```

Remplacer `RECOMMANDATION_UUID_ICI` par l'UUID de la recommandation testée.

Vérifier en DB :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT status, paid_at FROM winelio.stripe_payment_sessions ORDER BY created_at DESC LIMIT 1;\""
```

Résultat attendu : `status = 'paid'`, `paid_at` non null.

Vérifier que les commissions ont été créées :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT type, amount, status FROM winelio.commission_transactions WHERE recommendation_id='RECOMMANDATION_UUID_ICI';\""
```

Résultat attendu : plusieurs lignes (recommendation, referral_level_1…5, affiliation_bonus, platform_winelio, professional_cashback).

- [ ] **Step 9.7 — Commit final**

```bash
git add -A
git commit -m "test(stripe): verify end-to-end commission payment flow"
```

---

## Notes de déploiement

Avant de pousser sur `dev2` :
1. Ajouter les 4 variables d'environnement dans Coolify (Task 8.4)
2. Configurer le webhook Stripe en production : Dashboard Stripe → Developers → Webhooks → Add endpoint → URL : `https://dev2.winelio.app/api/stripe/webhook` → Event : `checkout.session.completed`
3. Récupérer le `STRIPE_WEBHOOK_SECRET` de la production (différent du Stripe CLI) et le mettre dans Coolify
4. Ajouter `CRON_SECRET` et `APP_URL` dans les secrets GitHub (Task 8.3)
