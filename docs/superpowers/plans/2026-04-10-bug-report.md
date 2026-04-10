# Bug Report System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton flottant permanent permettant aux bêta-testeurs de signaler un bug avec capture d'écran automatique, envoyer un email au support, et afficher la réponse du support en temps réel dans l'app.

**Architecture:** Un composant client `BugReportButton` est injecté dans le layout protégé. Il capture l'écran via `html2canvas`, envoie le rapport à `/api/bugs/report` (Storage + DB + email), et écoute `winelio.bug_reports` via Supabase Realtime pour afficher un toast quand le support répond. Un cron VPS appelle `/api/bugs/imap-poll` toutes les 5 min pour parser les réponses email via IMAP et mettre à jour la DB.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + Storage + Realtime), nodemailer, imapflow, html2canvas, sonner (toast)

---

## Fichiers à créer/modifier

| Action | Fichier | Rôle |
|---|---|---|
| Créer | `supabase/migrations/20260410_bug_reports.sql` | Table + RLS + bucket Storage |
| Créer | `src/app/api/bugs/report/route.ts` | Upload Storage + INSERT DB + email support |
| Créer | `src/app/api/bugs/imap-poll/route.ts` | IMAP poll + UPDATE DB |
| Créer | `src/components/bug-report-button.tsx` | Bouton flottant + modal + Realtime |
| Modifier | `src/app/(protected)/layout.tsx` | Ajouter `<BugReportButton>` |
| Modifier | `src/app/layout.tsx` | Ajouter `<Toaster>` de sonner |

---

## Task 1 : Migration SQL — table bug_reports + Storage

**Files:**
- Create: `supabase/migrations/20260410_bug_reports.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260410_bug_reports.sql

-- Table
CREATE TABLE IF NOT EXISTS winelio.bug_reports (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message        TEXT NOT NULL,
  screenshot_url TEXT,
  page_url       TEXT,
  status         TEXT DEFAULT 'pending' NOT NULL,
  admin_reply    TEXT,
  replied_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE winelio.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bug_reports_select_own"
  ON winelio.bug_reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "bug_reports_insert_own"
  ON winelio.bug_reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Storage bucket (privé)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "bug_screenshots_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2 : Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260410_bug_reports.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260410_bug_reports.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260410_bug_reports.sql"
```

Vérifier la sortie : pas d'erreur, `CREATE TABLE`, `CREATE POLICY`, `INSERT 1` attendus.

- [ ] **Step 3 : Vérifier la table en DB**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c '\dt winelio.bug_reports'"
```

Attendu : `winelio | bug_reports | table | supabase_admin`

- [ ] **Step 4 : Activer Realtime sur la table (via Studio)**

Ouvrir `http://31.97.152.195:54323` → Database → Replication → Activer `winelio.bug_reports` dans les tables suivies.

Ou via SQL :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE winelio.bug_reports;
```

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c 'ALTER PUBLICATION supabase_realtime ADD TABLE winelio.bug_reports;'"
```

- [ ] **Step 5 : Commiter**

```bash
git add supabase/migrations/20260410_bug_reports.sql
git commit -m "feat(db): table bug_reports + RLS + bucket bug-screenshots"
```

---

## Task 2 : Installer les dépendances

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1 : Installer html2canvas, imapflow, sonner**

```bash
npm install html2canvas imapflow sonner
```

- [ ] **Step 2 : Vérifier que le build passe**

```bash
npm run build
```

Attendu : build réussi sans erreur TypeScript.

- [ ] **Step 3 : Commiter**

```bash
git add package.json package-lock.json
git commit -m "chore: install html2canvas, imapflow, sonner"
```

---

## Task 3 : Ajouter le Toaster sonner dans le root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1 : Lire le fichier**

Lire `src/app/layout.tsx` pour voir la structure actuelle.

- [ ] **Step 2 : Ajouter le Toaster**

Ajouter l'import en haut :
```typescript
import { Toaster } from "sonner";
```

Ajouter `<Toaster richColors position="top-right" />` juste avant `</body>` dans le JSX, après `{children}`.

- [ ] **Step 3 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4 : Commiter**

```bash
git add src/app/layout.tsx
git commit -m "feat: add Sonner Toaster to root layout"
```

---

## Task 4 : API route /api/bugs/report

**Files:**
- Create: `src/app/api/bugs/report/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const message = formData.get("message") as string | null;
  const screenshot = formData.get("screenshot") as File | null;
  const pageUrl = (formData.get("pageUrl") as string | null) ?? "/";

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message requis" }, { status: 400 });
  }

  const reportId = crypto.randomUUID();
  let screenshotStoragePath: string | null = null;
  let screenshotSignedUrl: string | null = null;

  if (screenshot && screenshot.size > 0) {
    const bytes = await screenshot.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = screenshot.type === "image/webp" ? "webp" : "png";
    const path = `${user.id}/${reportId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("bug-screenshots")
      .upload(path, buffer, { contentType: screenshot.type, upsert: false });

    if (!uploadError) {
      screenshotStoragePath = path;
      const { data: signed } = await supabaseAdmin.storage
        .from("bug-screenshots")
        .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 jours
      screenshotSignedUrl = signed?.signedUrl ?? null;
    }
  }

  const { error: dbError } = await supabaseAdmin
    .from("bug_reports")
    .insert({
      id: reportId,
      user_id: user.id,
      message: message.trim(),
      screenshot_url: screenshotStoragePath,
      page_url: pageUrl,
    });

  if (dbError) {
    console.error("[bug/report] DB error:", dbError);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  // Envoi email support
  try {
    await transporter.sendMail({
      from: `"Winelio Support" <${process.env.SMTP_USER || "support@winelio.app"}>`,
      to: "support@winelio.app",
      replyTo: "support@winelio.app",
      subject: `[Bug #${reportId}] Signalement - ${pageUrl}`,
      html: buildBugEmailHtml(reportId, user.email ?? "", message.trim(), pageUrl, screenshotSignedUrl),
    });
  } catch (err) {
    console.error("[bug/report] SMTP error:", err);
    // Ne pas bloquer la réponse si l'email échoue
  }

  return NextResponse.json({ success: true, id: reportId });
}

function buildBugEmailHtml(
  reportId: string,
  userEmail: string,
  message: string,
  pageUrl: string,
  screenshotUrl: string | null
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const shortId = reportId.substring(0, 8);
  const screenshotHtml = screenshotUrl
    ? `<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
       <tr><td style="text-align:center;">
         <a href="${screenshotUrl}" style="display:inline-block;background:#FFF5F0;border:1px solid #FF6B35;border-radius:8px;padding:10px 20px;color:#FF6B35;font-size:13px;text-decoration:none;">
           Voir le screenshot →
         </a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
    <p style="text-align:center;margin:0 0 24px;">
      <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio" />
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;">
          <span style="font-size:24px;">🐛</span>
        </td>
        <td style="padding-left:16px;vertical-align:middle;">
          <p style="margin:0;color:#2D3436;font-size:18px;font-weight:700;">Nouveau signalement de bug</p>
          <p style="margin:4px 0 0;color:#636E72;font-size:13px;">Réf. #${esc(shortId)}</p>
        </td>
      </tr>
    </table>

    <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
      <tr><td>
        <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Message</p>
        <p style="margin:0;color:#2D3436;font-size:14px;line-height:1.6;">${esc(message)}</p>
      </td></tr>
    </table>

    <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-right:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Utilisateur</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(userEmail)}</p>
        </td>
        <td style="width:50%;padding-left:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Page</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(pageUrl)}</p>
        </td>
      </tr>
    </table>

    ${screenshotHtml}

    <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>

    <p style="margin:0;color:#B2BAC0;font-size:11px;text-align:center;">
      © 2026 <span style="color:#FF6B35;font-weight:600;">Winelio</span> — Répondez directement à cet email pour contacter le bêta-testeur.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
```

- [ ] **Step 2 : Vérifier le build TypeScript**

```bash
npm run build 2>&1 | tail -30
```

Attendu : aucune erreur TypeScript sur `src/app/api/bugs/report/route.ts`.

- [ ] **Step 3 : Commiter**

```bash
git add src/app/api/bugs/report/route.ts
git commit -m "feat(api): route POST /api/bugs/report — upload + DB + email"
```

---

## Task 5 : API route /api/bugs/imap-poll

**Files:**
- Create: `src/app/api/bugs/imap-poll/route.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImapFlow } from "imapflow";

export async function GET(req: NextRequest) {
  // Sécurité : vérifier le CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.IMAP_HOST || "ssl0.ovh.net";
  const port = Number(process.env.IMAP_PORT) || 993;
  const user = process.env.IMAP_USER || "support@winelio.app";
  const pass = process.env.IMAP_PASS || "";

  if (!pass) {
    return NextResponse.json({ error: "IMAP_PASS not configured" }, { status: 500 });
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let processed = 0;
  let errors = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Chercher les messages non lus
      const uids = await client.search({ seen: false }, { uid: true });

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(
            String(uid),
            { envelope: true, source: true },
            { uid: true }
          );

          const subject = msg?.envelope?.subject ?? "";
          const match = subject.match(/\[Bug #([0-9a-f-]{36})\]/i);
          if (!match) continue;

          const reportId = match[1];
          const rawSource = msg.source?.toString("utf-8") ?? "";

          // Extraire le texte de réponse (ignorer les lignes citées)
          const replyText = rawSource
            .split("\n")
            .filter((line) => {
              const trimmed = line.trim();
              return (
                !trimmed.startsWith(">") &&
                !/^On .+wrote:$/.test(trimmed) &&
                !/^De :/.test(trimmed) &&
                !/^From:/.test(trimmed) &&
                !trimmed.startsWith("--")
              );
            })
            .join("\n")
            .replace(/\r/g, "")
            .trim()
            .substring(0, 2000);

          if (!replyText) continue;

          const { error: dbError } = await supabaseAdmin
            .from("bug_reports")
            .update({
              status: "replied",
              admin_reply: replyText,
              replied_at: new Date().toISOString(),
            })
            .eq("id", reportId)
            .eq("status", "pending"); // Éviter d'écraser une réponse existante

          if (!dbError) {
            // Marquer comme lu
            await client.messageFlagsAdd({ uid: uid as unknown as number }, ["\\Seen"], { uid: true });
            processed++;
          }
        } catch (msgErr) {
          console.error(`[imap-poll] Erreur message uid=${uid}:`, msgErr);
          errors++;
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("[imap-poll] Erreur IMAP:", err);
    return NextResponse.json({ error: "IMAP connection failed", details: String(err) }, { status: 500 });
  }

  return NextResponse.json({ success: true, processed, errors });
}
```

- [ ] **Step 2 : Vérifier le build TypeScript**

```bash
npm run build 2>&1 | tail -30
```

Attendu : aucune erreur TypeScript sur `src/app/api/bugs/imap-poll/route.ts`.

- [ ] **Step 3 : Commiter**

```bash
git add src/app/api/bugs/imap-poll/route.ts
git commit -m "feat(api): route GET /api/bugs/imap-poll — IMAP poll + DB update"
```

---

## Task 6 : Composant BugReportButton

**Files:**
- Create: `src/components/bug-report-button.tsx`

- [ ] **Step 1 : Créer le composant**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PendingReply {
  id: string;
  reply: string;
}

export function BugReportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [pendingReply, setPendingReply] = useState<PendingReply | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supabase Realtime — écoute les réponses du support
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bug-reports-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "winelio",
          table: "bug_reports",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            admin_reply: string;
          };
          if (row.status === "replied" && row.admin_reply) {
            const reply: PendingReply = { id: row.id, reply: row.admin_reply };
            setHasUnread(true);
            setPendingReply(reply);
            toast("Réponse du support Winelio", {
              description: row.admin_reply.substring(0, 120) + (row.admin_reply.length > 120 ? "…" : ""),
              duration: 10000,
              action: {
                label: "Voir",
                onClick: () => {
                  setPendingReply(reply);
                  setReplyOpen(true);
                  setHasUnread(false);
                },
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function handleOpen() {
    setOpen(true);
    setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        scale: 0.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      setScreenshot(canvas.toDataURL("image/webp", 0.8));
    } catch {
      // Silencieux — l'utilisateur pourra uploader manuellement
    } finally {
      setCapturing(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setMessage("");
    setScreenshot(null);
    setScreenshotFile(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde", { description: "Maximum 5 MB." });
      return;
    }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!message.trim()) {
      toast.error("Décris le problème avant d'envoyer.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("message", message.trim());
      formData.append("pageUrl", window.location.pathname);

      if (screenshotFile) {
        formData.append("screenshot", screenshotFile);
      } else if (screenshot) {
        const res = await fetch(screenshot);
        const blob = await res.blob();
        formData.append(
          "screenshot",
          new File([blob], "screenshot.webp", { type: "image/webp" })
        );
      }

      const response = await fetch("/api/bugs/report", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Erreur serveur");

      handleClose();
      toast.success("Signalement envoyé !", {
        description: "Notre équipe va analyser le problème. Vous recevrez une réponse ici.",
      });
    } catch {
      toast.error("Échec de l'envoi", {
        description: "Vérifie ta connexion et réessaie.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={handleOpen}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber shadow-lg shadow-winelio-orange/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform lg:bottom-6"
        aria-label="Signaler un bug"
      >
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
        )}
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M5.07 5.07A9 9 0 1 0 18.93 18.93 9 9 0 0 0 5.07 5.07z"
          />
        </svg>
      </button>

      {/* Modal signalement */}
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-winelio-orange">🐛</span>
              Signaler un problème
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Screenshot preview */}
            <div className="relative rounded-lg overflow-hidden border border-black/10 bg-gray-50 h-36">
              {capturing && (
                <div className="absolute inset-0 flex items-center justify-center text-winelio-gray text-sm">
                  Capture en cours…
                </div>
              )}
              {!capturing && screenshot && (
                <img
                  src={screenshot}
                  alt="Screenshot"
                  className="w-full h-full object-cover object-top"
                />
              )}
              {!capturing && !screenshot && (
                <div className="absolute inset-0 flex items-center justify-center text-winelio-gray text-sm">
                  Pas de capture disponible
                </div>
              )}
            </div>

            {/* Remplacer screenshot */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-winelio-orange underline underline-offset-2"
            >
              Remplacer par mon propre screenshot
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décris le problème rencontré…"
              rows={4}
              className="w-full rounded-lg border border-black/10 bg-gray-50 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-winelio-orange/50"
            />

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || !message.trim()}
                className="bg-gradient-to-r from-winelio-orange to-winelio-amber text-white border-0"
              >
                {loading ? "Envoi…" : "Envoyer →"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog réponse support */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>💬</span>
              Réponse du support
            </DialogTitle>
          </DialogHeader>
          {pendingReply && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-black/10 rounded-lg p-4">
                <p className="text-sm text-winelio-dark leading-relaxed whitespace-pre-wrap">
                  {pendingReply.reply}
                </p>
              </div>
              <p className="text-xs text-winelio-gray">
                Réf. bug #{pendingReply.id.substring(0, 8)}
              </p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReplyOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -30
```

Attendu : aucune erreur TypeScript.

- [ ] **Step 3 : Commiter**

```bash
git add src/components/bug-report-button.tsx
git commit -m "feat: composant BugReportButton — bouton flottant + modal + Realtime"
```

---

## Task 7 : Intégrer BugReportButton dans le layout protégé

**Files:**
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 1 : Ajouter l'import**

Dans `src/app/(protected)/layout.tsx`, ajouter en haut des imports :

```typescript
import { BugReportButton } from "@/components/bug-report-button";
```

- [ ] **Step 2 : Ajouter le composant dans le JSX**

Dans la fonction `ProtectedLayout`, après `<MobileNav />` et avant `<main ...>`, ajouter :

```typescript
<BugReportButton userId={user.id} />
```

Le bloc correspondant doit ressembler à :
```typescript
      {/* Mobile: header + bottom nav */}
      <MobileHeader userEmail={user.email ?? ""} firstName={profile?.first_name ?? undefined} isSuperAdmin={isSuperAdmin} demoBanner={DEMO_MODE} />
      <MobileNav />

      {/* Bug report button (toutes pages) */}
      <BugReportButton userId={user.id} />

      {/* Main content */}
      <main ...>
```

- [ ] **Step 3 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

Attendu : build réussi.

- [ ] **Step 4 : Tester manuellement en local**

```bash
npm run dev &
```

Ouvrir `http://localhost:3003` (ou le port actif). Vérifier :
- Le bouton flottant orange apparaît en bas à droite
- Le clic ouvre le modal
- La capture auto s'affiche (peut prendre 1-2s)
- Le bouton "Remplacer" fonctionne
- L'envoi du formulaire retourne 200

- [ ] **Step 5 : Commiter**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat: intégrer BugReportButton dans le layout protégé"
```

---

## Task 8 : Variables d'env + cron VPS

**Files:**
- Aucun fichier code (configuration Coolify + VPS)

- [ ] **Step 1 : Ajouter les variables dans Coolify**

Dans le dashboard Coolify (`http://31.97.152.195:8000`), aller sur l'app `dev2.winelio.app` → Environment Variables et ajouter :

```
IMAP_HOST=ssl0.ovh.net
IMAP_PORT=993
IMAP_USER=support@winelio.app
IMAP_PASS=<mot de passe de support@winelio.app>
CRON_SECRET=<générer avec : openssl rand -base64 32>
```

Note : `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` n'est pas nécessaire côté code — le bucket est hardcodé comme `"bug-screenshots"` dans la route API (valeur statique).

- [ ] **Step 2 : Générer un CRON_SECRET**

```bash
openssl rand -base64 32
```

Copier la valeur générée dans Coolify ET noter-la pour la prochaine étape.

- [ ] **Step 3 : Configurer le cron sur le VPS**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "crontab -l"
```

Puis ouvrir crontab :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "crontab -e"
```

Ajouter la ligne (remplacer `<CRON_SECRET>` par la valeur générée) :
```
*/5 * * * * curl -s -X GET "https://dev2.winelio.app/api/bugs/imap-poll" -H "Authorization: Bearer <CRON_SECRET>" >> /var/log/imap-poll.log 2>&1
```

- [ ] **Step 4 : Tester le cron manuellement**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  'curl -s -X GET "https://dev2.winelio.app/api/bugs/imap-poll" -H "Authorization: Bearer <CRON_SECRET>"'
```

Attendu : `{"success":true,"processed":0,"errors":0}` (ou avec processed > 0 s'il y a des réponses en attente).

- [ ] **Step 5 : Vérifier les logs après un cycle**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "tail -20 /var/log/imap-poll.log"
```

---

## Task 9 : Test end-to-end

- [ ] **Step 1 : Déployer sur dev2**

```bash
git push
```

Attendre le déploiement Coolify (vérifier dans le dashboard ou via `~/bin/coolify-status dev`).

- [ ] **Step 2 : Test complet du flux**

1. Ouvrir `https://dev2.winelio.app` → se connecter
2. Cliquer sur le bouton flottant orange en bas à droite
3. Vérifier que le screenshot auto s'affiche
4. Écrire un message test, cliquer "Envoyer"
5. Vérifier que `support@winelio.app` reçoit bien l'email avec :
   - Subject : `[Bug #UUID] Signalement - /...`
   - Screenshot visible
   - Message du testeur
6. Répondre à cet email depuis la boîte support
7. Attendre max 5 min (cycle cron)
8. Vérifier que le toast apparaît dans l'app

- [ ] **Step 3 : Vérifier en DB que le rapport est mis à jour**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c 'SELECT id, status, replied_at FROM winelio.bug_reports ORDER BY created_at DESC LIMIT 5;'"
```

Attendu : `status = replied`, `replied_at` renseigné.
