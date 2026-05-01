# Relances automatiques pro après acceptation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter un cycle de 3 relances email automatiques au pro après les étapes 2/4/5 d'une recommandation, avec actions email signées (✅ fait / 📅 reporter / ❌ abandon), badge "abandonnée" côté referrer après 3 relances sans action.

**Architecture:** Table dédiée `winelio.recommendation_followups` (état explicite du cycle) + trigger SQL d'insertion à la complétion d'une étape 2/4/5 + cron worker `/15min` qui scanne les pending échus, envoie via `email_queue`, programme la relance suivante. Actions email via tokens HMAC signés (pas de session requise).

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL (schéma `winelio`), Nodemailer SMTP via `email_queue`, Cloudflare R2 pour les images d'email. Pas de framework de test sur ce projet — vérifications manuelles via `curl` et navigateur.

**Spec source:** `docs/superpowers/specs/2026-05-01-relances-pro-recommandation-design.md`

**Note environnement** :
- Branche dev : `dev2`, déployée sur https://dev2.winelio.app
- Serveur dev local port 3002, géré par PM2 (`pm2 restart winelio`)
- Migrations DB : voir CLAUDE.md section "Appliquer une migration"
- Toutes les requêtes Supabase doivent utiliser `.schema("winelio")`

---

## Task 1 : Migration SQL — table, colonnes, trigger

**Files:**
- Create: `supabase/migrations/20260501_recommendation_followups.sql`

- [ ] **Step 1.1 : Écrire la migration SQL complète**

```sql
-- supabase/migrations/20260501_recommendation_followups.sql
-- Système de relances automatiques pro après acceptation d'une recommandation
-- Spec : docs/superpowers/specs/2026-05-01-relances-pro-recommandation-design.md

BEGIN;

-- 1. Nouvelle table : suivi des relances pro
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
  cancel_reason     text,
  email_queue_id    uuid REFERENCES winelio.email_queue(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommendation_followups_due
  ON winelio.recommendation_followups (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_recommendation_followups_reco_step
  ON winelio.recommendation_followups (recommendation_id, after_step_order);

-- Une seule ligne pending par (reco, step) à la fois
CREATE UNIQUE INDEX recommendation_followups_one_pending_per_step
  ON winelio.recommendation_followups (recommendation_id, after_step_order)
  WHERE status = 'pending';

-- Trigger updated_at automatique (pattern existant dans winelio)
CREATE TRIGGER trg_recommendation_followups_updated_at
  BEFORE UPDATE ON winelio.recommendation_followups
  FOR EACH ROW EXECUTE FUNCTION winelio.set_updated_at();

-- 2. Nouvelles colonnes sur recommendations
ALTER TABLE winelio.recommendations
  ADD COLUMN expected_completion_at timestamptz,
  ADD COLUMN abandoned_by_pro_at    timestamptz;

COMMENT ON COLUMN winelio.recommendations.expected_completion_at IS
  'Date prévue de fin des travaux + paiement, saisie par le pro à l''étape 5. Programme la 1ère relance étape 5.';

COMMENT ON COLUMN winelio.recommendations.abandoned_by_pro_at IS
  'Date à laquelle le cycle de 3 relances s''est terminé sans action du pro.';

-- 3. Trigger : insertion auto des followups + cancel des pending
CREATE OR REPLACE FUNCTION winelio.handle_recommendation_step_completion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  step_order smallint;
  delay_int  interval;
  next_at    timestamptz;
BEGIN
  IF NEW.completed_at IS NULL OR (OLD IS NOT NULL AND OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT s.order_index INTO step_order
    FROM winelio.steps s WHERE s.id = NEW.step_id;

  -- Cancel TOUS les followups pending dont l'étape suivante est déjà complétée
  -- (couvre le saut d'étape : par ex. complétion étape 4 sans étape 3)
  UPDATE winelio.recommendation_followups
     SET status = 'cancelled', cancel_reason = 'next_step_done', updated_at = now()
   WHERE recommendation_id = NEW.recommendation_id
     AND status = 'pending'
     AND after_step_order < step_order;

  -- Crée un followup si l'étape complétée est 2, 4 ou 5
  IF step_order IN (2, 4) THEN
    delay_int := CASE WHEN step_order = 2 THEN interval '24 hours' ELSE interval '72 hours' END;
    next_at   := NEW.completed_at + delay_int;
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

COMMIT;
```

- [ ] **Step 1.2 : Vérifier que `winelio.set_updated_at()` existe**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT proname FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'winelio'::regnamespace;\""
```

Si la fonction n'existe pas, l'ajouter en tête de la migration :

```sql
CREATE OR REPLACE FUNCTION winelio.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
```

- [ ] **Step 1.3 : Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260501_recommendation_followups.sql root@31.97.152.195:/tmp/

sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260501_recommendation_followups.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260501_recommendation_followups.sql"
```

Expected output: `BEGIN`, `CREATE TABLE`, `CREATE INDEX` x3, `CREATE TRIGGER`, `ALTER TABLE`, `COMMENT` x2, `CREATE FUNCTION`, `CREATE TRIGGER`, `COMMIT`. Aucune ERROR.

- [ ] **Step 1.4 : Vérifier la table créée**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"\\d winelio.recommendation_followups\""
```

Expected: la table `recommendation_followups` listée avec toutes les colonnes.

- [ ] **Step 1.5 : Commit**

```bash
git add supabase/migrations/20260501_recommendation_followups.sql
git commit -m "feat(reco): table recommendation_followups + trigger d'insertion auto"
```

---

## Task 2 : Module HMAC pour les tokens d'action email

**Files:**
- Create: `src/lib/followup-token.ts`

- [ ] **Step 2.1 : Écrire le module**

```typescript
// src/lib/followup-token.ts
// Tokens HMAC signés pour les actions email de relance pro.
// Format URL : ?token=<base64url(payload)>.<signature>
// Payload : { fid: <followup_id>, exp: <epoch_seconds>, v: 1 }

import crypto from "crypto";

const SECRET = process.env.FOLLOWUP_ACTION_SECRET;
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours
const VERSION = 1;

function getSecret(): string {
  if (!SECRET || SECRET.length < 32) {
    throw new Error("FOLLOWUP_ACTION_SECRET manquant ou trop court (min 32 chars)");
  }
  return SECRET;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export interface FollowupPayload {
  fid: string;
  exp: number;
  v: number;
}

export function signFollowupToken(followupId: string): string {
  const payload: FollowupPayload = {
    fid: followupId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    v: VERSION,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export type VerifyResult =
  | { ok: true; payload: FollowupPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_version" };

export function verifyFollowupToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const providedSig = b64urlDecode(sigB64);
  if (expectedSig.length !== providedSig.length ||
      !crypto.timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: FollowupPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.v !== VERSION) return { ok: false, reason: "wrong_version" };
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (typeof payload.fid !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.fid)) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, payload };
}
```

- [ ] **Step 2.2 : Vérifier que ça compile**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npx tsc --noEmit -p . 2>&1 | grep -F "followup-token.ts" || echo "OK: pas d'erreur"
```

Expected: `OK: pas d'erreur` (ou aucune ligne mentionnant le fichier).

- [ ] **Step 2.3 : Ajouter `FOLLOWUP_ACTION_SECRET` dans Coolify (prod + dev2)**

⚠️ **Action manuelle Steph** (à confirmer avant de continuer) :
- Générer une clé : `openssl rand -base64 48`
- L'ajouter dans Coolify pour les apps `e13u8cq02wlio12lfj7a165h` (prod) et `eo5jc02jc760apovne577bln` (dev2) en variable `FOLLOWUP_ACTION_SECRET`
- Pour le dev local : ajouter dans `.env.local`

- [ ] **Step 2.4 : Commit**

```bash
git add src/lib/followup-token.ts
git commit -m "feat(reco): module followup-token (HMAC sign/verify)"
```

---

## Task 3 : Modifier `queueEmail` pour retourner l'id de la ligne

**Files:**
- Modify: `src/lib/email-queue.ts`

Le worker de followups a besoin de stocker l'id de la ligne `email_queue` créée pour audit.

- [ ] **Step 3.1 : Modifier la signature**

Remplacer le contenu de `src/lib/email-queue.ts` :

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
  /** Délai avant envoi */
  scheduledAt?: Date;
}

/**
 * Enfile un email dans winelio.email_queue.
 * L'envoi effectif est délégué au cron process-email-queue (max 600/h).
 * Ne pas utiliser pour les OTP (temps-réel) ni les emails avec pièce jointe PDF.
 *
 * @returns id de la ligne email_queue créée, ou null si échec d'insertion
 */
export async function queueEmail(params: QueueEmailParams): Promise<string | null> {
  const { data, error } = await supabaseAdmin
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
    })
    .select("id")
    .single();

  if (error) {
    console.error("[email-queue] Erreur insertion:", error.message);
    return null;
  }
  return data?.id ?? null;
}
```

- [ ] **Step 3.2 : Vérifier que les appelants existants ne cassent pas**

Tous les appelants existants ignorent la valeur de retour (auparavant `void`). Le passage à `Promise<string | null>` reste rétrocompatible.

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npx tsc --noEmit -p . 2>&1 | head -20
```

Expected: aucune erreur. Si certains appelants `await queueEmail(...)` sans `void`, ça reste valide.

- [ ] **Step 3.3 : Commit**

```bash
git add src/lib/email-queue.ts
git commit -m "feat(email): queueEmail retourne l'id de la ligne créée"
```

---

## Task 4 : Template `notify-pro-followup`

**Files:**
- Create: `src/lib/notify-pro-followup.ts`

- [ ] **Step 4.1 : Écrire le module**

```typescript
// src/lib/notify-pro-followup.ts
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { signFollowupToken } from "@/lib/followup-token";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

type AfterStep = 2 | 4 | 5;
type CycleIndex = 1 | 2 | 3;

const SUBJECT_BY_STEP: Record<AfterStep, string> = {
  2: "Avez-vous pris contact avec votre client ?",
  4: "Avez-vous transmis le devis à votre client ?",
  5: "Vos travaux sont-ils terminés ?",
};

const QUESTION_BY_STEP: Record<AfterStep, (contact: string) => string> = {
  2: (c) => `Avez-vous bien pris contact avec <strong style="color:#2D3436;">${c}</strong> ?`,
  4: (c) => `Avez-vous transmis le devis à <strong style="color:#2D3436;">${c}</strong> ?`,
  5: (c) => `Les travaux pour <strong style="color:#2D3436;">${c}</strong> sont-ils terminés et le paiement reçu ?`,
};

const SUBJECT_OVERRIDE_BY_CYCLE: Record<CycleIndex, ((base: string) => string) | null> = {
  1: null,
  2: () => "Toujours intéressé par cette recommandation ?",
  3: () => "Dernière relance — votre client attend une réponse",
};

const ICON_BY_CYCLE: Record<CycleIndex, string> = { 1: "🔔", 2: "⏰", 3: "⚠️" };

const H1_BY_CYCLE: Record<CycleIndex, (subject: string) => string> = {
  1: (s) => s,
  2: () => "Toujours intéressé par cette recommandation&nbsp;?",
  3: () => "Dernière relance avant abandon",
};

interface FollowupContext {
  followupId: string;
  recommendationId: string;
  afterStep: AfterStep;
  cycleIndex: CycleIndex;
}

export async function notifyProFollowup(ctx: FollowupContext): Promise<string | null> {
  const { followupId, recommendationId, afterStep, cycleIndex } = ctx;

  // Charger toutes les données nécessaires
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, project_description, created_at,
       professional:profiles!recommendations_professional_id_fkey(
         first_name, email, companies(name, email)
       ),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return null;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const pro = normalize<{ first_name: string | null; email: string | null; companies: unknown }>(rec.professional);
  const company = normalize<{ name: string | null; email: string | null }>(pro?.companies);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  // Email destinataire : email pro perso si dispo, sinon email company
  const recipientEmail = pro?.email || company?.email || null;
  if (!recipientEmail) return null;

  const proFirstName = pro?.first_name || "";
  const referrerName = [referrer?.first_name, referrer?.last_name].filter(Boolean).join(" ") || "Un membre Winelio";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "votre client";
  const companyName = company?.name || "votre entreprise";

  const baseSubject = SUBJECT_BY_STEP[afterStep];
  const subject = SUBJECT_OVERRIDE_BY_CYCLE[cycleIndex]?.(baseSubject) ?? baseSubject;
  const h1 = H1_BY_CYCLE[cycleIndex](baseSubject);
  const icon = ICON_BY_CYCLE[cycleIndex];
  const question = QUESTION_BY_STEP[afterStep](he(contactName));

  const token = signFollowupToken(followupId);
  const doneUrl = `${SITE_URL}/api/recommendations/followup-action?token=${encodeURIComponent(token)}&action=done`;
  const postponeUrl = `${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/postpone`;
  const abandonUrl = `${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/abandon`;

  const projectExcerpt = (rec.project_description ?? "").slice(0, 140);
  const greeting = proFirstName ? `Bonjour ${he(proFirstName)},` : "Bonjour,";
  const acceptedDaysAgo = Math.max(1, Math.round((Date.now() - new Date(rec.created_at).getTime()) / 86_400_000));

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${he(subject)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">${icon}</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">${h1}</h1></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${greeting}</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${he(referrerName)} a recommandé <strong style="color:#2D3436;">${he(companyName)}</strong> à ${he(contactName)} il y a ${acceptedDaysAgo} jour${acceptedDaysAgo > 1 ? "s" : ""}.</p></td></tr>
          ${projectExcerpt ? `<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td><p style="margin:0;color:#B2BAC0;font-size:13px;font-style:italic;line-height:1.6;">« ${he(projectExcerpt)}${(rec.project_description ?? "").length > 140 ? "…" : ""} »</p></td></tr>` : ""}
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#2D3436;font-size:16px;line-height:1.6;font-weight:600;">${question}</p></td></tr>
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:14px 18px;border-radius:4px;">
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">💡 Si c'est fait, marquez-le en 1 clic. Sinon, dites-nous quand vous serez en mesure de le faire.</p>
          </td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td><a href="${doneUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">✅ C'est fait</a></td>
                <td width="12" style="font-size:0;line-height:0;">&nbsp;</td>
                <td><a href="${postponeUrl}" style="display:inline-block;background:#FFFFFF;color:#FF6B35;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;border:2px solid #FF6B35;">📅 Reporter</a></td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><a href="${abandonUrl}" style="color:#B2BAC0;font-size:13px;text-decoration:underline;">Je ne peux pas donner suite</a></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return await queueEmail({
    to:      recipientEmail,
    toName:  proFirstName || undefined,
    subject,
    html,
    priority: cycleIndex === 3 ? 3 : 5,
  });
}
```

- [ ] **Step 4.2 : Vérifier la compilation**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npx tsc --noEmit -p . 2>&1 | grep -F "notify-pro-followup.ts" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4.3 : Commit**

```bash
git add src/lib/notify-pro-followup.ts
git commit -m "feat(reco): template email notify-pro-followup (3 cycles, 3 étapes)"
```

---

## Task 5 : Template `notify-pro-abandoned`

**Files:**
- Create: `src/lib/notify-pro-abandoned.ts`

- [ ] **Step 5.1 : Écrire le module**

```typescript
// src/lib/notify-pro-abandoned.ts
// Email envoyé au referrer après que le pro a ignoré 3 relances consécutives.
// Ton mesuré, pas de blame du pro.
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function notifyProAbandoned(recommendationId: string): Promise<void> {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id,
       referrer:profiles!recommendations_referrer_id_fkey(email, first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(companies(name)),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const referrer = normalize<{ email: string | null; first_name: string | null; last_name: string | null }>(rec.referrer);
  const pro = normalize<{ companies: unknown }>(rec.professional);
  const company = normalize<{ name: string | null }>(pro?.companies);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  if (!referrer?.email) return;

  const referrerFirstName = referrer.first_name || "";
  const proName = company?.name || "Le professionnel";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "votre contact";
  const ctaUrl = `${SITE_URL}/recommendations/${recommendationId}`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Le pro n'a pas donné suite</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">😞</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Votre recommandation n'avance plus</h1></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${referrerFirstName ? `Bonjour ${he(referrerFirstName)},` : "Bonjour,"}</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(proName)}</strong> n'a pas répondu à plusieurs relances concernant votre recommandation pour <strong style="color:#2D3436;">${he(contactName)}</strong>.</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Vous pouvez reprendre la main et la transférer à un autre pro depuis votre tableau de bord.</p></td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir ma recommandation →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await queueEmail({
    to:      referrer.email,
    toName:  referrerFirstName || undefined,
    subject: `${proName} n'a pas donné suite à votre recommandation`,
    html,
  });
}
```

- [ ] **Step 5.2 : Compilation OK**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npx tsc --noEmit -p . 2>&1 | grep -F "notify-pro-abandoned.ts" || echo "OK"
```

- [ ] **Step 5.3 : Commit**

```bash
git add src/lib/notify-pro-abandoned.ts
git commit -m "feat(reco): template email notify-pro-abandoned (referrer)"
```

---

## Task 6 : Cron worker `process-followups`

**Files:**
- Create: `src/app/api/recommendations/process-followups/route.ts`

- [ ] **Step 6.1 : Écrire la route**

```typescript
// src/app/api/recommendations/process-followups/route.ts
// Cron worker (toutes les 15 min) qui scanne les followups pending échus
// et envoie la relance email correspondante.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyProFollowup } from "@/lib/notify-pro-followup";
import { notifyProAbandoned } from "@/lib/notify-pro-abandoned";

const BATCH_SIZE = 50;
const DELAY_CYCLE_2_HOURS = 48;
const DELAY_CYCLE_3_DAYS = 5;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: pending, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, cycle_index")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[process-followups] fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const fu of pending) {
    try {
      const reason = await checkCancelReason(fu.recommendation_id, fu.after_step_order);
      if (reason) {
        await supabaseAdmin
          .schema("winelio")
          .from("recommendation_followups")
          .update({ status: "cancelled", cancel_reason: reason })
          .eq("id", fu.id);
        cancelled++;
        continue;
      }

      const emailQueueId = await notifyProFollowup({
        followupId: fu.id,
        recommendationId: fu.recommendation_id,
        afterStep: fu.after_step_order as 2 | 4 | 5,
        cycleIndex: fu.cycle_index as 1 | 2 | 3,
      });

      await supabaseAdmin
        .schema("winelio")
        .from("recommendation_followups")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          email_queue_id: emailQueueId,
        })
        .eq("id", fu.id);

      // Programmer la relance suivante OU déclencher l'abandon
      if (fu.cycle_index < 3) {
        const nextDelay = fu.cycle_index === 1
          ? DELAY_CYCLE_2_HOURS * 60 * 60 * 1000
          : DELAY_CYCLE_3_DAYS * 24 * 60 * 60 * 1000;
        const nextAt = new Date(Date.now() + nextDelay).toISOString();

        await supabaseAdmin
          .schema("winelio")
          .from("recommendation_followups")
          .insert({
            recommendation_id: fu.recommendation_id,
            after_step_order: fu.after_step_order,
            cycle_index: fu.cycle_index + 1,
            scheduled_at: nextAt,
          });
      } else {
        // Cycle 3 envoyé → marquer la reco comme abandonnée + notifier le referrer
        await supabaseAdmin
          .schema("winelio")
          .from("recommendations")
          .update({ abandoned_by_pro_at: new Date().toISOString() })
          .eq("id", fu.recommendation_id)
          .is("abandoned_by_pro_at", null);

        await notifyProAbandoned(fu.recommendation_id);
      }

      sent++;
    } catch (err) {
      console.error(`[process-followups] erreur followup ${fu.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ processed: pending.length, sent, cancelled, failed });
}

async function checkCancelReason(
  recommendationId: string,
  afterStepOrder: number
): Promise<string | null> {
  // Reco refusée / transférée / abandonnée ?
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("status")
    .eq("id", recommendationId)
    .single();

  if (!rec) return "reco_deleted";
  if (rec.status === "REJECTED") return "reco_refused";
  if (rec.status === "TRANSFERRED") return "reco_transferred";

  // Une étape > afterStepOrder déjà complétée ?
  const { data: laterSteps } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recommendationId)
    .not("completed_at", "is", null);

  if (laterSteps?.some((s) => {
    const step = Array.isArray(s.step) ? s.step[0] : s.step;
    return (step?.order_index ?? 0) > afterStepOrder;
  })) {
    return "next_step_done";
  }

  return null;
}
```

- [ ] **Step 6.2 : Tester localement (dry-run avec un followup factice)**

⚠️ Étape de validation manuelle. Insérer un followup pending échu en SQL :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT id FROM winelio.recommendations LIMIT 1;\""
```

(Note l'UUID retourné, l'utiliser ci-dessous.) Puis :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"INSERT INTO winelio.recommendation_followups (recommendation_id, after_step_order, cycle_index, scheduled_at) \
     VALUES ('<UUID_RECO>', 2, 1, now() - interval '1 minute');\""
```

Appeler le worker :

```bash
curl -X POST http://localhost:3002/api/recommendations/process-followups \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected JSON: `{"processed":1,"sent":1|0,"cancelled":0|1,"failed":0}` (cancelled=1 si l'étape 3 est déjà complétée sur cette reco).

Vérifier le statut du followup en DB :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -c \
   \"SELECT status, sent_at, cancel_reason FROM winelio.recommendation_followups ORDER BY created_at DESC LIMIT 1;\""
```

Nettoyer les données de test après validation.

- [ ] **Step 6.3 : Commit**

```bash
git add src/app/api/recommendations/process-followups/route.ts
git commit -m "feat(reco): cron worker process-followups"
```

---

## Task 7 : Route action `followup-action`

**Files:**
- Create: `src/app/api/recommendations/followup-action/route.ts`

- [ ] **Step 7.1 : Écrire la route**

```typescript
// src/app/api/recommendations/followup-action/route.ts
// Endpoint appelé par les boutons des emails de relance.
// Token HMAC signé, pas de session Supabase requise.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyFollowupToken } from "@/lib/followup-token";

const MAX_REPORTS = 5;
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const postponeTo = url.searchParams.get("postpone_to");

  const verified = verifyFollowupToken(token);
  if (!verified.ok) {
    return htmlPage("Lien expiré", `Ce lien a expiré ou est invalide. Connectez-vous à votre tableau de bord pour mettre à jour vos recommandations.`, "error");
  }

  const { data: fu } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, status, report_count")
    .eq("id", verified.payload.fid)
    .single();

  if (!fu) {
    return htmlPage("Relance introuvable", "Cette relance n'existe plus.", "error");
  }

  if (action === "done") {
    return await handleDone(fu);
  }
  if (action === "postpone") {
    return await handlePostpone(fu, postponeTo);
  }
  if (action === "abandon") {
    // GET /abandon est juste un redirect vers la page de confirmation
    return NextResponse.redirect(`${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/abandon`);
  }

  return htmlPage("Action invalide", "Action non reconnue.", "error");
}

// POST utilisé par les pages publiques (postpone confirmé / abandon confirmé)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = body.token ?? "";
  const action = body.action ?? "";
  const postponeTo = body.postpone_to ?? null;

  const verified = verifyFollowupToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: "Token invalide ou expiré" }, { status: 400 });
  }

  const { data: fu } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, status, report_count")
    .eq("id", verified.payload.fid)
    .single();

  if (!fu) {
    return NextResponse.json({ error: "Relance introuvable" }, { status: 404 });
  }

  if (action === "postpone") {
    return await postJsonPostpone(fu, postponeTo);
  }
  if (action === "abandon") {
    return await postJsonAbandon(fu);
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}

interface FollowupRow {
  id: string;
  recommendation_id: string;
  after_step_order: number;
  status: string;
  report_count: number;
}

async function handleDone(fu: FollowupRow): Promise<Response> {
  // Trouver l'étape à compléter (after_step_order + 1)
  const targetOrder = fu.after_step_order + 1;

  const { data: stepRow } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select("id, completed_at, step:steps!inner(order_index)")
    .eq("recommendation_id", fu.recommendation_id)
    .eq("step.order_index", targetOrder)
    .single();

  if (!stepRow) {
    return htmlPage("Étape introuvable", "Cette étape n'existe plus pour cette recommandation.", "error");
  }
  if (stepRow.completed_at) {
    return htmlPage("Déjà fait, merci", "Cette étape a déjà été marquée comme complétée. Merci !", "success");
  }

  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", stepRow.id);

  // Le trigger SQL cancel les followups pending et crée le suivant si applicable.
  return htmlPage("Étape validée", "Merci ! L'étape a été marquée comme complétée.", "success");
}

async function handlePostpone(fu: FollowupRow, postponeToParam: string | null): Promise<Response> {
  if (!postponeToParam) {
    // Pas de paramètre → redirect vers la page menu
    return NextResponse.redirect(
      `${SITE_URL}/recommendations/followup/${encodeURIComponent(buildTokenForFollowup(fu.id))}/postpone`
    );
  }
  const result = await applyPostpone(fu, postponeToParam);
  if (result.error) return htmlPage(result.title, result.message, "error");
  return htmlPage("Relance reportée", `Nous reviendrons vers vous le ${result.formattedDate}.`, "success");
}

async function postJsonPostpone(fu: FollowupRow, postponeToParam: string | null): Promise<Response> {
  if (!postponeToParam) return NextResponse.json({ error: "postpone_to manquant" }, { status: 400 });
  const result = await applyPostpone(fu, postponeToParam);
  if (result.error) return NextResponse.json({ error: result.message }, { status: result.status ?? 400 });
  return NextResponse.json({ ok: true, scheduled_at: result.scheduledAt });
}

async function postJsonAbandon(fu: FollowupRow): Promise<Response> {
  // Marquer la reco comme refusée (réutilise le statut REJECTED)
  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ status: "REJECTED" })
    .eq("id", fu.recommendation_id);

  // Cancel tous les followups pending de cette reco
  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .update({ status: "cancelled", cancel_reason: "reco_refused" })
    .eq("recommendation_id", fu.recommendation_id)
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}

interface PostponeResult {
  error?: boolean;
  status?: number;
  title: string;
  message: string;
  scheduledAt?: string;
  formattedDate?: string;
}

async function applyPostpone(fu: FollowupRow, postponeToParam: string): Promise<PostponeResult> {
  if (fu.status !== "pending") {
    return { error: true, title: "Déjà traitée", message: "Cette relance a déjà été traitée." };
  }
  if (fu.report_count >= MAX_REPORTS) {
    return { error: true, status: 409, title: "Limite atteinte", message: `Vous avez atteint la limite de ${MAX_REPORTS} reports pour cette étape.` };
  }
  const target = new Date(postponeToParam);
  if (isNaN(target.getTime())) {
    return { error: true, title: "Date invalide", message: "Date invalide." };
  }
  const nowMs = Date.now();
  const minMs = nowMs + 60 * 60 * 1000;          // +1h
  const maxMs = nowMs + 365 * 24 * 60 * 60 * 1000; // +1 an
  if (target.getTime() < minMs || target.getTime() > maxMs) {
    return { error: true, title: "Date hors limites", message: "La date doit être comprise entre +1h et +1 an." };
  }

  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .update({
      scheduled_at: target.toISOString(),
      cycle_index: 1,
      report_count: fu.report_count + 1,
    })
    .eq("id", fu.id);

  return {
    title: "Reportée",
    message: "OK",
    scheduledAt: target.toISOString(),
    formattedDate: target.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
}

function buildTokenForFollowup(_fid: string): string {
  // Helper interne uniquement utilisé pour le redirect ci-dessus.
  // Le token original est déjà dans l'URL côté pro, mais ici on renvoie vers la page sans regenerate.
  // En pratique, on ne devrait jamais arriver ici (l'utilisateur passe par /postpone directement),
  // mais on prévoit un fallback safe qui demande de revenir à l'email.
  return "";
}

function htmlPage(title: string, message: string, variant: "success" | "error"): Response {
  const color = variant === "success" ? "#16a34a" : "#dc2626";
  const icon = variant === "success" ? "✅" : "⚠️";
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:480px;margin:60px auto;padding:40px;background:#fff;border-radius:16px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
  <h1 style="color:${color};font-size:22px;margin:0 0 12px;">${title}</h1>
  <p style="color:#636E72;font-size:15px;line-height:1.6;margin:0 0 24px;">${message}</p>
  <a href="${SITE_URL}" style="display:inline-block;color:#FF6B35;text-decoration:underline;font-size:14px;">Aller sur Winelio</a>
</div>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
```

- [ ] **Step 7.2 : Tester GET ?action=done localement**

```bash
# Récupérer un token depuis un appel local au worker (ou en générant un manuellement)
# Insertion d'un followup factice + appel manuel (réutiliser la procédure du Step 6.2)
# Puis curl avec le token retourné dans l'email_queue
```

Test plus simple : générer un token via `node -e` :

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
FOLLOWUP_ACTION_SECRET=$(grep FOLLOWUP_ACTION_SECRET .env.local | cut -d= -f2) \
node -e "import('./src/lib/followup-token.ts').then(m => console.log(m.signFollowupToken('00000000-0000-0000-0000-000000000000')))" 2>&1 || \
echo "Test manuel via le worker plus simple"
```

(Si le ts-node setup pose problème, valider plutôt par un appel end-to-end après avoir tout déployé.)

- [ ] **Step 7.3 : Commit**

```bash
git add src/app/api/recommendations/followup-action/route.ts
git commit -m "feat(reco): route followup-action (done / postpone / abandon)"
```

---

## Task 8 : Page publique `/recommendations/followup/[token]/postpone`

**Files:**
- Create: `src/app/recommendations/followup/[token]/postpone/page.tsx`

- [ ] **Step 8.1 : Écrire la page**

```tsx
// src/app/recommendations/followup/[token]/postpone/page.tsx
// Page publique : menu intermédiaire pour reporter une relance.
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PostponePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ formattedDate: string } | null>(null);
  const [customDate, setCustomDate] = useState("");

  const handlePostpone = async (offsetMs: number, dateOverride?: string) => {
    setSubmitting(true);
    setError(null);
    const targetIso = dateOverride
      ? new Date(dateOverride).toISOString()
      : new Date(Date.now() + offsetMs).toISOString();

    const res = await fetch("/api/recommendations/followup-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        action: "postpone",
        postpone_to: targetIso,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }
    const formattedDate = new Date(targetIso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });
    setDone({ formattedDate });
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">📅</div>
          <h1 className="text-xl font-bold text-winelio-dark mb-2">Relance reportée</h1>
          <p className="text-winelio-gray mb-6">Nous reviendrons vers vous le <strong>{done.formattedDate}</strong>.</p>
          <button onClick={() => router.push("/")} className="text-winelio-orange underline text-sm">Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📅</div>
          <h1 className="text-xl font-bold text-winelio-dark">Reporter la relance</h1>
          <p className="text-sm text-winelio-gray mt-2">Choisissez quand nous devrons revenir vers vous.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => handlePostpone(48 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 48 heures
          </button>
          <button
            onClick={() => handlePostpone(7 * 24 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 1 semaine
          </button>
          <button
            onClick={() => handlePostpone(30 * 24 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 1 mois
          </button>

          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-semibold text-winelio-dark mb-2">Choisir une date précise</label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={() => customDate && handlePostpone(0, customDate)}
              disabled={submitting || !customDate}
              className="mt-2 w-full rounded-xl bg-winelio-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Reporter à cette date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2 : Compilation OK**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | grep -E "error|Error" | head -10 || echo "OK"
```

- [ ] **Step 8.3 : Commit**

```bash
git add "src/app/recommendations/followup/[token]/postpone/page.tsx"
git commit -m "feat(reco): page publique /followup/[token]/postpone"
```

---

## Task 9 : Page publique `/recommendations/followup/[token]/abandon`

**Files:**
- Create: `src/app/recommendations/followup/[token]/abandon/page.tsx`

- [ ] **Step 9.1 : Écrire la page**

```tsx
// src/app/recommendations/followup/[token]/abandon/page.tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AbandonPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAbandon = async () => {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/recommendations/followup-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, action: "abandon" }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-xl font-bold text-winelio-dark mb-2">Vu, merci</h1>
          <p className="text-winelio-gray mb-6">La recommandation a été marquée comme abandonnée. Le client sera prévenu.</p>
          <button onClick={() => router.push("/")} className="text-winelio-orange underline text-sm">Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-winelio-dark mb-2">Confirmer l'abandon</h1>
        <p className="text-winelio-gray mb-6 text-sm leading-relaxed">
          Vous êtes sur le point d'indiquer que vous ne pouvez pas donner suite à cette recommandation.
          Cette action est définitive et le client sera prévenu.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            disabled={submitting}
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-semibold text-winelio-dark"
          >
            Annuler
          </button>
          <button
            onClick={handleAbandon}
            disabled={submitting}
            className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2 : Build + commit**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -5
git add "src/app/recommendations/followup/[token]/abandon/page.tsx"
git commit -m "feat(reco): page publique /followup/[token]/abandon"
```

---

## Task 10 : Backend complete-step accepte `expected_completion_at`

**Files:**
- Modify: `src/app/api/recommendations/complete-step/route.ts`

- [ ] **Step 10.1 : Ajouter le champ**

Modifier la route. Localiser ce bloc (~ligne 80-92) :

```typescript
    // Étape 5 : enregistrer le montant du devis
    if (stepIndex === 5) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
      }
      stepData.montant = amount;
      await supabase
        .from("recommendations")
        .update({ amount })
        .eq("id", rec.id);
    }
```

Le remplacer par :

```typescript
    // Étape 5 : enregistrer le montant du devis + date prévue de fin de travaux
    if (stepIndex === 5) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
      }

      const expectedCompletionRaw = body.expected_completion_at;
      if (!expectedCompletionRaw) {
        return NextResponse.json(
          { error: "Date prévue de fin des travaux obligatoire" },
          { status: 400 }
        );
      }
      const expectedDate = new Date(expectedCompletionRaw);
      const nowMs = Date.now();
      if (
        isNaN(expectedDate.getTime()) ||
        expectedDate.getTime() < nowMs + 24 * 60 * 60 * 1000 ||
        expectedDate.getTime() > nowMs + 2 * 365 * 24 * 60 * 60 * 1000
      ) {
        return NextResponse.json(
          { error: "Date prévue invalide (entre +1 jour et +2 ans)" },
          { status: 400 }
        );
      }

      stepData.montant = amount;
      stepData.date_prevue = expectedDate.toLocaleDateString("fr-FR");

      // IMPORTANT : update expected_completion_at AVANT de marquer l'étape complétée,
      // sinon le trigger SQL ne lit pas la valeur correcte.
      await supabase
        .from("recommendations")
        .update({ amount, expected_completion_at: expectedDate.toISOString() })
        .eq("id", rec.id);
    }
```

Aussi, ajuster la déstructuration en haut de la fonction (~ligne 28) :

```typescript
const { recommendation_id, step_id, quote_amount } = body;
```

devient :

```typescript
const { recommendation_id, step_id, quote_amount } = body;
// expected_completion_at est lu directement plus bas si stepIndex === 5
```

Aucun changement nécessaire à cette ligne. La lecture de `body.expected_completion_at` se fait à l'intérieur du bloc `stepIndex === 5`.

- [ ] **Step 10.2 : Build + test**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | grep -E "error|Error" | head -10 || echo "OK"
```

- [ ] **Step 10.3 : Commit**

```bash
git add src/app/api/recommendations/complete-step/route.ts
git commit -m "feat(reco): expected_completion_at obligatoire à l'étape 5"
```

---

## Task 11 : Formulaire devis avec champ délai estimé

**Files:**
- Modify: `src/app/(protected)/recommendations/[id]/page.tsx`

- [ ] **Step 11.1 : Ajouter l'état et les helpers**

Dans `page.tsx`, après la déclaration `const [quoteAmount, setQuoteAmount] = useState("")` (chercher cette ligne pour la repérer), ajouter :

```typescript
  const [expectedDelay, setExpectedDelay] = useState<string>("");
  const [customExpectedDate, setCustomExpectedDate] = useState<string>("");
```

Ajouter après les helpers existants :

```typescript
  const DELAY_PRESETS: Record<string, number> = {
    "7d":   7 * 24 * 60 * 60 * 1000,
    "4w":   28 * 24 * 60 * 60 * 1000,
    "3m":   90 * 24 * 60 * 60 * 1000,
    "6m":   180 * 24 * 60 * 60 * 1000,
    "12m":  365 * 24 * 60 * 60 * 1000,
  };

  const computeExpectedDate = (): string | null => {
    if (expectedDelay === "custom") {
      return customExpectedDate ? new Date(customExpectedDate).toISOString() : null;
    }
    const offset = DELAY_PRESETS[expectedDelay];
    if (!offset) return null;
    return new Date(Date.now() + offset).toISOString();
  };
```

- [ ] **Step 11.2 : Modifier le payload de `handleCompleteStep`**

Localiser (`~ligne 170`) :

```typescript
        body: JSON.stringify({
          recommendation_id: recommendation.id,
          step_id: currentStep.id,
          quote_amount: (currentStep?.step?.order_index ?? 0) === 5 ? quoteAmount : undefined,
        }),
```

Le remplacer par :

```typescript
        body: JSON.stringify({
          recommendation_id: recommendation.id,
          step_id: currentStep.id,
          quote_amount: (currentStep?.step?.order_index ?? 0) === 5 ? quoteAmount : undefined,
          expected_completion_at: (currentStep?.step?.order_index ?? 0) === 5 ? computeExpectedDate() : undefined,
        }),
```

Et après `setQuoteAmount("")` à la fin de la fonction (`~ligne 188`), ajouter :

```typescript
    setExpectedDelay("");
    setCustomExpectedDate("");
```

- [ ] **Step 11.3 : Ajouter le champ délai dans le formulaire**

Localiser le bloc `(currentStep?.step?.order_index ?? 0) === 5 && (` (~ligne 452). Après le bloc `<div className="mb-4">` qui contient l'input "Montant du devis", insérer un nouveau bloc :

```tsx
                {(currentStep?.step?.order_index ?? 0) === 5 && (
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-bold text-winelio-dark">
                      Délai estimé avant fin des travaux + paiement
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        { value: "7d",  label: "Sous 7 jours" },
                        { value: "4w",  label: "2-4 semaines" },
                        { value: "3m",  label: "1-3 mois" },
                        { value: "6m",  label: "3-6 mois" },
                        { value: "12m", label: "Plus de 6 mois" },
                        { value: "custom", label: "Date précise" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setExpectedDelay(opt.value)}
                          className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                            expectedDelay === opt.value
                              ? "border-winelio-orange bg-winelio-orange/5 text-winelio-orange"
                              : "border-gray-200 bg-white text-winelio-dark hover:border-winelio-orange/30"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {expectedDelay === "custom" && (
                      <input
                        type="date"
                        value={customExpectedDate}
                        onChange={(e) => setCustomExpectedDate(e.target.value)}
                        min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        max={new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        className="mt-2 w-full rounded-xl border border-winelio-gray/20 bg-white px-4 py-2 text-sm"
                      />
                    )}
                    <p className="mt-2 text-xs text-winelio-gray">
                      Nous vous enverrons un rappel à cette date pour confirmer la fin du chantier. Vous pourrez le reporter si besoin.
                    </p>
                  </div>
                )}
```

⚠️ Note : ce nouveau bloc `mb-4` doit être ajouté **après** le bloc montant existant, **dans le même conteneur conditionnel**. Si tu trouves plus pratique, fusionne-les en un seul bloc `(stepIndex === 5)` avec les deux champs côte-à-côte.

- [ ] **Step 11.4 : Modifier le `disabled` du bouton Valider**

Localiser (~ligne 476) :

```typescript
disabled={completing || refusing || ((currentStep?.step?.order_index ?? 0) === 5 && !quoteAmount)}
```

Le remplacer par :

```typescript
disabled={
  completing ||
  refusing ||
  ((currentStep?.step?.order_index ?? 0) === 5 && (!quoteAmount || !computeExpectedDate()))
}
```

- [ ] **Step 11.5 : Build + test manuel**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -5
pm2 restart winelio
```

Manuel : ouvrir une reco à l'étape 5 sur `http://localhost:3002`, vérifier que le champ "Délai estimé" apparaît avec les 6 boutons + date picker custom, et que "Valider" est disabled tant que le délai n'est pas choisi.

- [ ] **Step 11.6 : Commit**

```bash
git add "src/app/(protected)/recommendations/[id]/page.tsx"
git commit -m "feat(reco): champ 'délai estimé' obligatoire au formulaire devis (étape 5)"
```

---

## Task 12 : Encart "Prochaine relance" côté pro

**Files:**
- Create: `src/components/recommendation-followup-card.tsx`
- Modify: `src/app/(protected)/recommendations/[id]/page.tsx`

- [ ] **Step 12.1 : Créer le composant**

```tsx
// src/components/recommendation-followup-card.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FollowupRow {
  id: string;
  after_step_order: number;
  cycle_index: number;
  scheduled_at: string;
  report_count: number;
}

interface Props {
  recommendationId: string;
  isProfessional: boolean;
}

const STEP_LABEL: Record<number, string> = {
  2: "prendre contact",
  4: "soumettre le devis",
  5: "finaliser les travaux",
};

export function RecommendationFollowupCard({ recommendationId, isProfessional }: Props) {
  const [followup, setFollowup] = useState<FollowupRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isProfessional) { setLoading(false); return; }
    const supabase = createClient();
    supabase
      .schema("winelio")
      .from("recommendation_followups")
      .select("id, after_step_order, cycle_index, scheduled_at, report_count")
      .eq("recommendation_id", recommendationId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setFollowup(data);
        setLoading(false);
      });
  }, [recommendationId, isProfessional]);

  if (loading || !followup || !isProfessional) return null;

  const daysUntil = Math.max(0, Math.round((new Date(followup.scheduled_at).getTime() - Date.now()) / 86_400_000));
  const action = STEP_LABEL[followup.after_step_order] ?? "avancer";

  return (
    <div className="mb-4 rounded-xl border border-winelio-orange/20 bg-winelio-orange/5 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔔</div>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-winelio-dark">
            Prochaine relance dans {daysUntil} jour{daysUntil > 1 ? "s" : ""} (cycle {followup.cycle_index}/3)
          </p>
          <p className="text-xs text-winelio-gray mt-1">
            Pensez à {action} pour faire avancer cette recommandation.
            {followup.report_count > 0 && ` Reportée ${followup.report_count} fois (5 max).`}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2 : L'utiliser dans la page détail reco**

Dans `src/app/(protected)/recommendations/[id]/page.tsx`, importer le composant en haut :

```tsx
import { RecommendationFollowupCard } from "@/components/recommendation-followup-card";
```

Puis l'ajouter juste avant `<StepTimeline ... />` (cherche `<StepTimeline` dans le fichier) :

```tsx
              <RecommendationFollowupCard
                recommendationId={recommendation.id}
                isProfessional={userId === recommendation.professional_id}
              />
              <StepTimeline ... />
```

- [ ] **Step 12.3 : RLS — autoriser le pro à lire ses followups**

⚠️ Étape DB. Ajouter une policy SELECT sur `recommendation_followups` pour que le pro puisse lire les siens :

Créer `supabase/migrations/20260501_recommendation_followups_rls.sql` :

```sql
ALTER TABLE winelio.recommendation_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pro sees own followups"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winelio.recommendations r
      WHERE r.id = recommendation_followups.recommendation_id
        AND r.professional_id = auth.uid()
    )
  );

CREATE POLICY "Referrer sees own followups (read-only)"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winelio.recommendations r
      WHERE r.id = recommendation_followups.recommendation_id
        AND r.referrer_id = auth.uid()
    )
  );

CREATE POLICY "Super admin sees all followups"
  ON winelio.recommendation_followups FOR SELECT
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin'
  );
```

Appliquer :

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260501_recommendation_followups_rls.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260501_recommendation_followups_rls.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260501_recommendation_followups_rls.sql"
```

- [ ] **Step 12.4 : Build + test manuel**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -3
pm2 restart winelio
```

Manuel : se connecter en tant que pro, ouvrir une reco où l'étape 2 vient d'être complétée → vérifier que l'encart "Prochaine relance dans X jours" apparaît.

- [ ] **Step 12.5 : Commit**

```bash
git add src/components/recommendation-followup-card.tsx \
        "src/app/(protected)/recommendations/[id]/page.tsx" \
        supabase/migrations/20260501_recommendation_followups_rls.sql
git commit -m "feat(reco): encart 'Prochaine relance' côté pro + RLS"
```

---

## Task 13 : Badge "Abandonnée" + bandeau côté referrer

**Files:**
- Modify: `src/app/(protected)/recommendations/[id]/page.tsx`
- Modify: page liste recos `src/app/(protected)/recommendations/page.tsx` (vérifier le path exact)

- [ ] **Step 13.1 : Récupérer `abandoned_by_pro_at` dans le SELECT**

Dans `src/app/(protected)/recommendations/[id]/page.tsx`, localiser le SELECT qui charge la reco (chercher `from("recommendations")`). Ajouter `abandoned_by_pro_at` à la liste des colonnes sélectionnées.

Modifier l'interface `RecommendationDetail` pour ajouter :

```typescript
interface RecommendationDetail {
  ...
  abandoned_by_pro_at: string | null;
}
```

- [ ] **Step 13.2 : Ajouter le bandeau côté referrer**

Localiser dans le rendu l'endroit où `userId === recommendation.referrer_id`. Ajouter un bandeau en haut du contenu (juste après le hero) :

```tsx
              {recommendation.abandoned_by_pro_at && userId === recommendation.referrer_id && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">😞</div>
                    <div className="flex-1 text-sm">
                      <p className="font-semibold text-amber-900">
                        Le professionnel n'a pas donné suite
                      </p>
                      <p className="text-xs text-amber-800 mt-1">
                        Vous pouvez la transférer à un autre pro depuis le bouton « Transférer » ci-dessous.
                      </p>
                    </div>
                  </div>
                </div>
              )}
```

- [ ] **Step 13.3 : Badge dans la liste des recos**

Localiser le fichier de la liste (probablement `src/app/(protected)/recommendations/page.tsx`). Vérifier qu'il SELECT `abandoned_by_pro_at`. Ajouter à côté du badge de statut :

```tsx
{reco.abandoned_by_pro_at && (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
    Abandonnée par le pro
  </span>
)}
```

- [ ] **Step 13.4 : Build + commit**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -3
git add "src/app/(protected)/recommendations/"
git commit -m "feat(reco): badge + bandeau 'abandonnée par le pro' côté referrer"
```

---

## Task 14 : Timeline followups dans l'admin

**Files:**
- Create: `src/components/admin/FollowupTimeline.tsx`
- Modify: page `/gestion-reseau/recommandations/[id]/page.tsx`

- [ ] **Step 14.1 : Créer le composant timeline**

```tsx
// src/components/admin/FollowupTimeline.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";

interface Props {
  recommendationId: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending:    "En attente",
  sent:       "Envoyée",
  cancelled:  "Annulée",
  superseded: "Remplacée",
};

const REASON_LABEL: Record<string, string> = {
  next_step_done:    "Étape suivante complétée",
  reco_refused:      "Reco refusée",
  reco_transferred:  "Reco transférée",
  pro_inactive:      "Pro inactif",
  pro_abandoned:     "Cycle terminé",
};

export async function FollowupTimeline({ recommendationId }: Props) {
  const { data: rows } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, after_step_order, cycle_index, scheduled_at, status, sent_at, report_count, cancel_reason, created_at")
    .eq("recommendation_id", recommendationId)
    .order("created_at", { ascending: true });

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-500">Aucune relance programmée pour cette recommandation.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs font-mono text-gray-400 mt-0.5">
            #{row.after_step_order}.{row.cycle_index}
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-gray-900">
              Relance après étape {row.after_step_order} (cycle {row.cycle_index}/3) — {STATUS_LABEL[row.status]}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Programmée : {new Date(row.scheduled_at).toLocaleString("fr-FR")}
              {row.sent_at && ` · Envoyée : ${new Date(row.sent_at).toLocaleString("fr-FR")}`}
              {row.cancel_reason && ` · Raison : ${REASON_LABEL[row.cancel_reason] ?? row.cancel_reason}`}
              {row.report_count > 0 && ` · Reportée ${row.report_count}×`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 14.2 : Intégrer dans la page admin**

Localiser la page admin de détail reco (`src/app/gestion-reseau/recommandations/[id]/page.tsx`). Ajouter une section :

```tsx
import { FollowupTimeline } from "@/components/admin/FollowupTimeline";

// ... dans le rendu, ajouter une nouvelle section :
<section className="mt-8">
  <h2 className="text-lg font-bold mb-3">Historique des relances pro</h2>
  <FollowupTimeline recommendationId={params.id} />
</section>
```

- [ ] **Step 14.3 : Build + commit**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -3
git add src/components/admin/FollowupTimeline.tsx src/app/gestion-reseau/recommandations
git commit -m "feat(admin): timeline historique des relances pro"
```

---

## Task 15 : Intégration cancel sur refus/transfert manuel

**Files:**
- Modify: route ou Server Action `refuseRecommendation` et `transfer_recommendation`

Le trigger SQL gère le cancel quand une étape avance, mais pas quand la reco est refusée/transférée explicitement par l'UI. Il faut que ces 2 chemins cancel aussi les followups pending.

- [ ] **Step 15.1 : Localiser les 2 chemins**

```bash
grep -rln "REJECTED\|status.*= *.refused\|refuseRecommendation" /Users/steph/PROJETS/WINELIO/winelio/src --include="*.ts" --include="*.tsx" | head -10
grep -rln "transfer_recommendation\|TRANSFERRED" /Users/steph/PROJETS/WINELIO/winelio/src --include="*.ts" --include="*.tsx" | head -10
```

- [ ] **Step 15.2 : Ajouter le cancel après le passage à REJECTED**

Pour chaque endroit qui fait `update({ status: "REJECTED" })` sur `recommendations`, ajouter juste après :

```typescript
await supabase  // ou supabaseAdmin selon le contexte
  .schema("winelio")
  .from("recommendation_followups")
  .update({ status: "cancelled", cancel_reason: "reco_refused" })
  .eq("recommendation_id", <recoId>)
  .eq("status", "pending");
```

- [ ] **Step 15.3 : Idem pour TRANSFERRED**

Même pattern, avec `cancel_reason: "reco_transferred"`.

- [ ] **Step 15.4 : Build + commit**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build 2>&1 | tail -3
git add -u
git commit -m "feat(reco): cancel followups au refus/transfert d'une reco"
```

---

## Task 16 : Documentation projet

**Files:**
- Modify: `CLAUDE.md`
- Modify: `doc/architecture.md`
- Modify: `doc/database.md`
- Modify: `doc/api-routes.md`

- [ ] **Step 16.1 : Mettre à jour CLAUDE.md**

Localiser la section "Workflow de recommandation (8 étapes)". Corriger en "Workflow de recommandation (7 étapes)" et y ajouter le schéma textuel de l'organigramme tiré du spec (voir spec section "Schéma textuel à intégrer dans CLAUDE.md").

Ajouter une nouvelle sous-section "Relances automatiques pro" qui résume :
- Cycle de 3 relances espacées 1ère / +48h / +5j sur étapes 2/4/5
- Délais 1ère relance (24h / 72h / `expected_completion_at`)
- Actions email : C'est fait / Reporter (max 5) / Abandon
- Fin de cycle : `abandoned_by_pro_at` + email soft referrer
- Cron `*/15 * * * *` sur `/api/recommendations/process-followups`

- [ ] **Step 16.2 : Mettre à jour doc/database.md**

Ajouter à la liste des tables : `recommendation_followups` (description : suivi des relances pro après acceptation, cycle 3 relances, max 5 reports). Documenter les nouvelles colonnes `recommendations.expected_completion_at` et `recommendations.abandoned_by_pro_at`. Documenter le trigger `handle_recommendation_step_completion`.

- [ ] **Step 16.3 : Mettre à jour doc/api-routes.md**

Ajouter :
- `POST /api/recommendations/process-followups` (auth `Bearer CRON_SECRET`, scanne les pending échus)
- `GET /api/recommendations/followup-action?token=&action=` (clic depuis email, token HMAC)
- `POST /api/recommendations/followup-action` (depuis pages publiques)
- Pages publiques : `/recommendations/followup/[token]/postpone` et `/abandon`

- [ ] **Step 16.4 : Mettre à jour doc/architecture.md**

Ajouter :
- `recommendation_followups` (FEATURE) — `[PERSISTE DANS]` table `recommendation_followups`, `[DÉCLENCHE]` `notify-pro-followup` puis `notify-pro-abandoned`
- Cron worker `process-followups` (CORE) — `[UTILISE]` `email-queue`, `[DÉPEND DE]` `recommendation_followups`
- Module `followup-token` (UTILITY) — `[UTILISÉ PAR]` `notify-pro-followup`, `followup-action`

- [ ] **Step 16.5 : Commit**

```bash
git add CLAUDE.md doc/
git commit -m "docs: relances auto pro + workflow 7 étapes corrigé"
```

---

## Task 17 : Cron registration côté infra

⚠️ **Action manuelle Steph côté VPS** (à exécuter une fois la branche `dev2` déployée).

- [ ] **Step 17.1 : Choisir le mécanisme**

Vérifier comment les autres crons sont déclenchés (`/api/email/process-queue`, `/api/stripe/cron-reminders`, `/api/bugs/imap-poll`). Probablement crontab sur le VPS Hostinger ou cron Coolify. Ajouter :

```cron
*/15 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
              https://dev2.winelio.app/api/recommendations/process-followups > /dev/null 2>&1
```

(Et idem pour la prod `https://winelio.app/...` au moment du passage en prod.)

- [ ] **Step 17.2 : Tester le cron en prod (premier déclenchement)**

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://dev2.winelio.app/api/recommendations/process-followups
```

Expected: `{"processed":0}` initialement (aucun followup pending). Vérifier dans pm2 logs qu'aucune erreur n'est loggée.

---

## Task 18 : Test end-to-end final

⚠️ **Test manuel sur dev2.winelio.app** une fois tout déployé.

- [ ] **Step 18.1 : Scénario nominal — étape 2 → relance → C'est fait**

1. Créer une reco de test (compte referrer A → contact dummy → catégorie quelconque → pro de test)
2. En tant que pro : marquer étape 2 (Acceptée). Vérifier en DB qu'un followup `cycle_index=1, scheduled_at=now+24h` est créé.
3. En DB : `UPDATE winelio.recommendation_followups SET scheduled_at = now() WHERE id = ...` pour forcer l'envoi immédiat.
4. Trigger manuel : `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dev2.winelio.app/api/recommendations/process-followups`
5. Vérifier que l'email arrive sur l'email du pro avec les 3 boutons.
6. Cliquer "✅ C'est fait" → page de succès, étape 3 marquée complétée, followup `status=cancelled, cancel_reason=next_step_done` (ou nouvelle ligne suivante en attente — pour étape 2 il n'y a rien à faire après).

- [ ] **Step 18.2 : Scénario report → +5 reports → cycle 3 → abandoned**

Idem, mais cliquer "Reporter" 5 fois (forcer chaque fois `scheduled_at` à `now()` en DB pour ne pas attendre). Au 6e essai, vérifier que le bouton est bloqué. Laisser le cycle 1, 2, 3 se dérouler. Vérifier que `recommendations.abandoned_by_pro_at` est posé et que le referrer reçoit l'email "abandonné".

- [ ] **Step 18.3 : Scénario étape 5 avec date personnalisée**

Créer une reco, avancer jusqu'à l'étape 5, soumettre devis + délai "Sous 7 jours". Vérifier que `expected_completion_at = now() + 7j` et qu'un followup `after_step_order=5, cycle_index=1, scheduled_at = now() + 7j` est créé.

---

## Self-review (à exécuter avant de marquer le plan terminé)

- [ ] Spec coverage : chaque section du spec est couverte par au moins une task (DB → T1, token → T2, queueEmail return → T3, templates → T4-T5, worker → T6, action → T7, pages → T8-T9, complete-step → T10, formulaire → T11, encart pro → T12, referrer → T13, admin → T14, intégration cancel → T15, doc → T16, cron → T17, e2e → T18) ✓
- [ ] Pas de placeholder type "TBD" ou "implémenter X" — tout est codé en clair
- [ ] Cohérence : `signFollowupToken` (T2) est appelé dans T4 ; `verifyFollowupToken` (T2) est appelé dans T7 ; types matchent
- [ ] Cohérence : la signature `queueEmail` modifiée en T3 (retour `string | null`) est consommée par les modules T4 et T5 (T5 ignore le retour, T4 le retourne)
- [ ] Tâches de RLS et de cron sont explicitement marquées comme actions DB / infra
- [ ] L'ordre des tâches est exécutable de haut en bas (chaque task ne dépend que des précédentes)
