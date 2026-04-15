# Email Queue OVH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un tampon (queue) pour tous les emails non-critiques afin d'éviter le blacklistage OVH en cas de pics d'envoi.

**Architecture:** Une table `winelio.email_queue` stocke tous les emails en attente. Une route API `/api/email/process-queue` traite 10 emails par appel (POST sécurisé par `CRON_SECRET`). Un job pg_cron appelle cette route toutes les minutes via l'extension `pg_net`, soit max 600 emails/heure. Les OTP de connexion et les emails avec pièce jointe PDF (signature CGU) continuent d'être envoyés immédiatement.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL (pg_cron + pg_net), nodemailer, TypeScript

---

## Fichiers impliqués

| Action | Fichier | Rôle |
|--------|---------|------|
| Créer | `supabase/migrations/20260415_email_queue.sql` | Table + index + pg_cron |
| Créer | `src/lib/email-transporter.ts` | Transporter nodemailer partagé (remplace les 6 copies) |
| Créer | `src/lib/email-queue.ts` | Fonction `queueEmail()` — écriture en base |
| Créer | `src/app/api/email/process-queue/route.ts` | Traitement de la queue (POST, CRON_SECRET) |
| Modifier | `src/lib/notify-new-referral.ts` | `transporter.sendMail` → `queueEmail` |
| Modifier | `src/lib/notify-commission-payment.ts` | `transporter.sendMail` → `queueEmail` |
| Modifier | `src/lib/notify-pro-onboarding.ts` | `transporter.sendMail` → `queueEmail` |
| Modifier | `src/app/api/email/welcome/route.ts` | `transporter.sendMail` → `queueEmail` |
| Modifier | `src/app/api/network/send-invite/route.ts` | `transporter.sendMail` → `queueEmail` |
| Modifier | `src/app/api/bugs/report/route.ts` | `transporter.sendMail` → `queueEmail` |
| **Ne pas modifier** | `src/app/api/auth/send-code/route.ts` | OTP temps-réel → envoi direct maintenu |
| **Ne pas modifier** | `src/lib/notify-signature-cgu.ts` | Pièce jointe PDF → envoi direct maintenu |

---

## Task 1 : Migration SQL — table email_queue + pg_cron

**Fichiers :**
- Créer : `supabase/migrations/20260415_email_queue.sql`

- [ ] **Étape 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260415_email_queue.sql

-- Table de queue
CREATE TABLE IF NOT EXISTS winelio.email_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email     text        NOT NULL,
  to_name      text,
  subject      text        NOT NULL,
  html         text        NOT NULL,
  text_body    text,
  from_email   text        NOT NULL DEFAULT 'support@winelio.app',
  from_name    text        NOT NULL DEFAULT 'Winelio',
  reply_to     text,
  priority     int         NOT NULL DEFAULT 5,  -- 1=urgent 5=normal 10=bulk
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','sending','sent','failed')),
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 3,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index pour le traitement (seuls les pending qui sont prêts)
CREATE INDEX IF NOT EXISTS email_queue_process_idx
  ON winelio.email_queue (priority ASC, scheduled_at ASC)
  WHERE status = 'pending';

-- RLS : la table est accessible uniquement via service_role
ALTER TABLE winelio.email_queue ENABLE ROW LEVEL SECURITY;

-- pg_cron : activer l'extension si pas encore fait
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Job cron : appel toutes les minutes
-- Remplacer APP_URL par l'URL de l'app en production
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://dev2.winelio.app/api/email/process-queue',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer ' ||
                 current_setting('app.cron_secret', true) || '"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
```

- [ ] **Étape 2 : Configurer le secret dans PostgreSQL**

Sur le VPS, ajouter la variable `app.cron_secret` dans `postgresql.conf` ou via psql :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"ALTER DATABASE postgres SET app.cron_secret = 'VALEUR_DE_CRON_SECRET';\""
```

> Remplacer `VALEUR_DE_CRON_SECRET` par la valeur réelle du `.env.local` / Coolify.

- [ ] **Étape 3 : Appliquer la migration**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_email_queue.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_email_queue.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/20260415_email_queue.sql"
```

Résultat attendu : `CREATE TABLE`, `CREATE INDEX`, `CREATE EXTENSION`, une ligne de `cron.schedule`.

- [ ] **Étape 4 : Vérifier que la table existe**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"\d winelio.email_queue\""
```

- [ ] **Étape 5 : Commit**

```bash
git add supabase/migrations/20260415_email_queue.sql
git commit -m "feat(db): table email_queue + pg_cron process-email-queue"
```

---

## Task 2 : Transporter nodemailer partagé

**Fichiers :**
- Créer : `src/lib/email-transporter.ts`

> Actuellement chaque `notify-*.ts` et chaque route API recrée son propre `nodemailer.createTransport`. Ce fichier centralise la configuration une seule fois.

- [ ] **Étape 1 : Créer le fichier**

```typescript
// src/lib/email-transporter.ts
import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT) || 465;

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: smtpPort,
  secure: smtpPort === 465,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 8000,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

export const SMTP_FROM = `"${process.env.SMTP_SENDER_NAME || "Winelio"}" <${process.env.SMTP_USER || "support@winelio.app"}>`;

export const SEND_TIMEOUT_MS = 10_000;

export async function sendMailWithTimeout(
  message: Parameters<typeof transporter.sendMail>[0]
): Promise<void> {
  await Promise.race([
    transporter.sendMail(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SMTP timeout")), SEND_TIMEOUT_MS)
    ),
  ]);
}
```

- [ ] **Étape 2 : Vérifier que le build ne casse pas**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully` (ou warnings sans erreurs).

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/email-transporter.ts
git commit -m "feat(lib): transporter nodemailer partagé avec sendMailWithTimeout"
```

---

## Task 3 : Helper queueEmail()

**Fichiers :**
- Créer : `src/lib/email-queue.ts`

- [ ] **Étape 1 : Créer le fichier**

```typescript
// src/lib/email-queue.ts
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface QueueEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** 1 = urgent, 5 = normal (défaut), 10 = bulk */
  priority?: number;
  /** Délai avant envoi (ex: new Date(Date.now() + 60_000)) */
  scheduledAt?: Date;
}

/**
 * Enfile un email dans winelio.email_queue.
 * L'envoi effectif est délégué au cron process-email-queue (max 600/h).
 * Ne jamais utiliser pour les OTP (temps-réel) ni les emails avec pièce jointe PDF.
 */
export async function queueEmail(params: QueueEmailParams): Promise<void> {
  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .insert({
      to_email:     params.to,
      to_name:      params.toName ?? null,
      subject:      params.subject,
      html:         params.html,
      text_body:    params.text ?? null,
      reply_to:     params.replyTo ?? null,
      priority:     params.priority ?? 5,
      scheduled_at: params.scheduledAt?.toISOString() ?? new Date().toISOString(),
    });

  if (error) {
    // Log mais ne pas bloquer l'appel métier
    console.error("[email-queue] Erreur insertion:", error.message);
  }
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/email-queue.ts
git commit -m "feat(lib): helper queueEmail() — insertion dans email_queue"
```

---

## Task 4 : Route de traitement de la queue

**Fichiers :**
- Créer : `src/app/api/email/process-queue/route.ts`

- [ ] **Étape 1 : Créer le fichier**

```typescript
// src/app/api/email/process-queue/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";

/** Nombre d'emails traités par appel (600/h max avec pg_cron toutes les minutes) */
const BATCH_SIZE = 10;

/** Délai avant retry après échec (en minutes) : tentative 1→5min, 2→30min, 3→120min */
const RETRY_DELAYS_MIN = [5, 30, 120];

export async function POST(req: Request) {
  // Auth cron
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prendre les N prochains emails pending (scheduled_at <= now)
  // Le UPDATE atomique évite les doublons si deux workers tournent en parallèle
  const { data: batch, error: fetchErr } = await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .select("id, to_email, to_name, subject, html, text_body, from_email, from_name, reply_to, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("[process-queue] fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!batch || batch.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const ids = batch.map((r) => r.id);

  // Marquer comme "sending" (lock optimiste)
  await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .update({ status: "sending" })
    .in("id", ids);

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    batch.map(async (row) => {
      try {
        await sendMailWithTimeout({
          from:    `"${row.from_name}" <${row.from_email}>` ?? SMTP_FROM,
          to:      row.to_name ? `"${row.to_name}" <${row.to_email}>` : row.to_email,
          replyTo: row.reply_to ?? undefined,
          subject: row.subject,
          html:    row.html,
          text:    row.text_body ?? undefined,
        });

        await supabaseAdmin
          .schema("winelio")
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id);

        sent++;
      } catch (err) {
        const attempts = (row.attempts ?? 0) + 1;
        const maxAttempts = 3;
        const delayMin = RETRY_DELAYS_MIN[attempts - 1] ?? 120;
        const nextTry = new Date(Date.now() + delayMin * 60_000).toISOString();

        await supabaseAdmin
          .schema("winelio")
          .from("email_queue")
          .update({
            status:       attempts >= maxAttempts ? "failed" : "pending",
            attempts,
            error:        err instanceof Error ? err.message : String(err),
            scheduled_at: attempts >= maxAttempts ? undefined : nextTry,
          })
          .eq("id", row.id);

        failed++;
        console.error(`[process-queue] échec email ${row.id} (tentative ${attempts}):`, err);
      }
    })
  );

  return NextResponse.json({ processed: batch.length, sent, failed });
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Étape 3 : Tester manuellement (insérer un email de test)**

```bash
# Insérer un email de test dans la queue
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"INSERT INTO winelio.email_queue (to_email, subject, html) VALUES
      ('TON_EMAIL@test.fr', 'Test queue Winelio', '<p>Ceci est un test de queue.</p>');\""

# Déclencher manuellement la route (serveur dev doit tourner sur :3002)
curl -s -X POST http://localhost:3002/api/email/process-queue \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json"
```

Résultat attendu : `{"processed":1,"sent":1,"failed":0}` et réception de l'email.

- [ ] **Étape 4 : Vérifier le statut en base**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT to_email, status, sent_at, attempts FROM winelio.email_queue ORDER BY created_at DESC LIMIT 5;\""
```

Résultat attendu : `status = sent`, `sent_at` renseigné.

- [ ] **Étape 5 : Commit**

```bash
git add src/app/api/email/process-queue/route.ts
git commit -m "feat(api): route POST /api/email/process-queue — batch 10 emails/min avec retry"
```

---

## Task 5 : Migrer notify-new-referral → queue

**Fichiers :**
- Modifier : `src/lib/notify-new-referral.ts`

- [ ] **Étape 1 : Remplacer le contenu du fichier**

Supprimer le `transporter` local et remplacer les appels `transporter.sendMail` par `queueEmail` :

```typescript
// src/lib/notify-new-referral.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

function buildReferralEmail(
  recipientFirstName: string,
  newMemberName: string,
  level: number
): string {
  const levelLabel =
    level === 1
      ? "votre filleul direct"
      : `un membre de votre réseau (niveau&nbsp;${level})`;
  const levelColor = level === 1 ? "#FF6B35" : "#F7931E";
  const emoji      = level === 1 ? "🎉" : "🌱";
  const iconBg     = level === 1 ? "#FFF5F0" : "#FFF8EE";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau membre dans votre réseau !</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:${iconBg};border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          ${emoji}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Nouveau membre dans votre réseau !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Bonjour <strong style="color:#2D3436;">${he(recipientFirstName)}</strong>,
                    </p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                      <strong style="color:${levelColor};">${he(newMemberName)}</strong>
                      vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.
                    </p>
                    ${level === 1 ? `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      En tant que parrain direct, vous bénéficierez d'une commission sur chaque recommandation validée de ce nouveau membre.
                    </p>` : `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau&nbsp;${level}.
                    </p>`}
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:${levelColor};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 20px;border-radius:20px;text-transform:uppercase;text-align:center;">
                          Niveau ${level}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${SITE_URL}/network"
                             style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Voir mon réseau →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">
                © 2026 Winelio · Plateforme de recommandation professionnelle
              </p>
              <p style="color:#FF6B35;font-size:11px;margin:0;">
                Recommandez. Connectez. Gagnez.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function notifyNewReferral(newUserId: string): Promise<number> {
  const { data: newProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", newUserId)
    .single();

  const newMemberName =
    [newProfile?.first_name, newProfile?.last_name].filter(Boolean).join(" ") ||
    "Un nouveau membre";

  const sponsorChain: Array<{ id: string; level: number }> = [];
  let currentId = newUserId;

  for (let level = 1; level <= 5; level++) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();
    if (!profile?.sponsor_id) break;
    sponsorChain.push({ id: profile.sponsor_id, level });
    currentId = profile.sponsor_id;
  }

  if (sponsorChain.length === 0) return 0;

  const sponsorIds = sponsorChain.map((s) => s.id);

  const [profilesResult, authResults] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, first_name").in("id", sponsorIds),
    Promise.all(sponsorIds.map((id) => supabaseAdmin.auth.admin.getUserById(id))),
  ]);

  const profileMap = new Map(
    (profilesResult.data ?? []).map((p) => [p.id, p.first_name as string | null])
  );
  const emailMap = new Map(
    sponsorIds.map((id, i) => [id, authResults[i].data?.user?.email ?? null])
  );

  let queued = 0;
  for (const { id, level } of sponsorChain) {
    const email = emailMap.get(id);
    if (!email || email.endsWith("@winelio-pro.fr") || email.endsWith("@winelio-demo.internal")) continue;

    const firstName = profileMap.get(id) || "Membre";
    const subject =
      level === 1
        ? `${newMemberName} a rejoint votre reseau Winelio`
        : `Nouveau membre niveau ${level} dans votre reseau Winelio`;

    const levelLabel = level === 1 ? "filleul direct" : `membre niveau ${level}`;
    const text = [
      `Bonjour ${firstName},`,
      "",
      `${newMemberName} vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.`,
      "",
      level === 1
        ? "En tant que parrain direct, vous beneficierez d'une commission sur chaque recommandation validee."
        : `Votre reseau grandit ! Commission au niveau ${level}.`,
      "",
      "Voir mon reseau : " + SITE_URL + "/network",
    ].join("\n");

    await queueEmail({
      to: email,
      subject,
      html: buildReferralEmail(firstName, newMemberName, level),
      text,
      priority: level === 1 ? 3 : 7, // filleul direct = priorité haute
    });
    queued++;
  }

  return queued;
}
```

- [ ] **Étape 2 : Build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/notify-new-referral.ts
git commit -m "refactor(email): notify-new-referral → queue OVH"
```

---

## Task 6 : Migrer notify-commission-payment, notify-pro-onboarding, send-invite, welcome, bugs/report

**Fichiers :**
- Modifier : `src/lib/notify-commission-payment.ts`
- Modifier : `src/lib/notify-pro-onboarding.ts`
- Modifier : `src/app/api/network/send-invite/route.ts`
- Modifier : `src/app/api/email/welcome/route.ts`
- Modifier : `src/app/api/bugs/report/route.ts`

Le principe est identique pour chaque fichier :
1. Supprimer `import nodemailer from "nodemailer"` et la création du `transporter` local
2. Ajouter `import { queueEmail } from "@/lib/email-queue"`
3. Remplacer `transporter.sendMail({ from, to, subject, html, text })` par `await queueEmail({ to, subject, html, text })`

- [ ] **Étape 1 : Modifier notify-commission-payment.ts**

Chercher les appels `transporter.sendMail(` dans `src/lib/notify-commission-payment.ts` et les remplacer.

Supprimer en haut du fichier :
```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({ ... });
const FROM = `"Winelio" <...>`;
```

Ajouter en haut :
```typescript
import { queueEmail } from "@/lib/email-queue";
```

Remplacer chaque `transporter.sendMail({` par `await queueEmail({` en adaptant les champs :
- `from` → supprimer (géré par la queue)
- `to` → `to`
- `subject` → `subject`
- `html` → `html`
- `text` → `text`

- [ ] **Étape 2 : Modifier notify-pro-onboarding.ts** — même procédure

- [ ] **Étape 3 : Modifier src/app/api/network/send-invite/route.ts** — même procédure

- [ ] **Étape 4 : Modifier src/app/api/email/welcome/route.ts** — même procédure

- [ ] **Étape 5 : Modifier src/app/api/bugs/report/route.ts** — même procédure, avec `priority: 10` (bulk)

- [ ] **Étape 6 : Build final**

```bash
npm run build 2>&1 | tail -30
```

Résultat attendu : aucune erreur TypeScript, `✓ Compiled successfully`.

- [ ] **Étape 7 : Commit groupé**

```bash
git add src/lib/notify-commission-payment.ts \
        src/lib/notify-pro-onboarding.ts \
        src/app/api/network/send-invite/route.ts \
        src/app/api/email/welcome/route.ts \
        src/app/api/bugs/report/route.ts
git commit -m "refactor(email): 5 expéditeurs migrés vers email_queue OVH"
```

---

## Task 7 : Vérification end-to-end + activation pg_cron sur le VPS

- [ ] **Étape 1 : Vérifier que pg_cron est actif**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT jobname, schedule, command FROM cron.job;\""
```

Résultat attendu : une ligne `process-email-queue` avec schedule `* * * * *`.

- [ ] **Étape 2 : Vérifier que pg_net peut appeler l'URL**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT net.http_post(
    url := 'https://dev2.winelio.app/api/email/process-queue',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
    )::jsonb,
    body := '{}'::jsonb
  );\""
```

Résultat attendu : un `id` de requête (pas d'erreur).

- [ ] **Étape 3 : Simuler une inscription et vérifier la queue**

Dans l'app, faire une inscription test (ou déclencher `notifyNewReferral` manuellement). Puis :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT to_email, subject, status, attempts, error FROM winelio.email_queue ORDER BY created_at DESC LIMIT 10;\""
```

Attendre 1 minute, puis vérifier que le `status` est passé à `sent`.

- [ ] **Étape 4 : Push et déploiement**

```bash
git push origin dev2
```

Vérifier dans Coolify que le déploiement part et réussit.

---

## Résumé des décisions

| Email | Stratégie | Raison |
|-------|-----------|--------|
| OTP connexion (`send-code`) | **Direct** | L'utilisateur attend le code, délai inacceptable |
| Signature CGU (`notify-signature-cgu`) | **Direct** | Pièce jointe PDF non sérialisable simplement |
| Nouveau filleul (`notify-new-referral`) | **Queue** | Jusqu'à 5 emails simultanés par inscription |
| Commission payment | **Queue** | Volume variable |
| Onboarding pro | **Queue** | Non urgent |
| Invitation réseau | **Queue** | Non urgent |
| Email bienvenue | **Queue** | Non urgent |
| Rapport de bug | **Queue, priority 10** | Faible priorité |

**Limite effective : 10 emails/minute = 600/heure** — largement au-dessus des besoins actuels, en dessous du risque OVH.
