# Signature Électronique Agents Immobiliers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux agents immobiliers de signer électroniquement les CGU Agents Immobiliers via un pad de signature dessinée dans une modale fullscreen, avec génération d'un PDF certifié archivé dans Supabase Storage et email de confirmation.

**Architecture:** Nouvelle colonne `is_hoguet` sur `winelio.categories` pour détecter les agents immobiliers. La page `pro-onboarding` charge l'ID du document CGU AI et les catégories avec `is_hoguet`. Le wizard détecte si la catégorie sélectionnée est Hoguet et affiche `SignatureModal` à la place de la checkbox CGU. La server action `signAgentCGU` (distincte de `completeProOnboarding`) gère upload image, génération PDF weasyprint, log audit, activation profil, email.

**Tech Stack:** `signature_pad` (npm), Node.js `execFile` + `weasyprint`, Supabase Storage bucket `legal-signatures`, `nodemailer`, Next.js 15 Server Actions

**Prérequis :** Sous-projets 1 (audit trail) et 2 (seed CGU AI) doivent être déployés avant ce plan.

---

## Fichiers

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260415_is_hoguet_and_storage.sql` | Créer |
| `src/components/SignaturePad.tsx` | Créer |
| `src/lib/generate-signed-pdf.ts` | Créer |
| `src/lib/notify-signature-cgu.ts` | Créer |
| `src/app/(protected)/profile/pro-onboarding/sign-action.ts` | Créer |
| `src/components/SignatureModal.tsx` | Créer |
| `src/app/(protected)/profile/pro-onboarding/page.tsx` | Modifier |
| `src/components/ProOnboardingWizard.tsx` | Modifier |

---

### Task 1 : Migration — colonne `is_hoguet` + bucket Storage

**Files:**
- Create: `supabase/migrations/20260415_is_hoguet_and_storage.sql`

- [ ] **Step 1 : Créer la migration**

```sql
-- supabase/migrations/20260415_is_hoguet_and_storage.sql

-- Colonne is_hoguet sur les catégories
ALTER TABLE winelio.categories
  ADD COLUMN IF NOT EXISTS is_hoguet boolean NOT NULL DEFAULT false;

-- Marquer les agents immobiliers (adapter le nom si différent dans la DB)
UPDATE winelio.categories
SET is_hoguet = true
WHERE LOWER(name) LIKE '%immobilier%'
   OR LOWER(name) LIKE '%agent immo%';

-- Bucket Supabase Storage pour les signatures et PDF signés
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-signatures', 'legal-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- RLS lecture publique (liens directs téléchargeables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read legal-signatures'
  ) THEN
    CREATE POLICY "Public read legal-signatures"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'legal-signatures');
  END IF;
END $$;
```

- [ ] **Step 2 : Appliquer la migration**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_is_hoguet_and_storage.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_is_hoguet_and_storage.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/20260415_is_hoguet_and_storage.sql"
```

Expected: `ALTER TABLE`, `UPDATE X`, `INSERT 0 1` (ou `DO` si bucket existait déjà), `CREATE POLICY`.

- [ ] **Step 3 : Vérifier les catégories is_hoguet**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT id, name, is_hoguet FROM winelio.categories WHERE is_hoguet = true;\""
```

Expected: au moins 1 ligne avec la catégorie agent immobilier.

Si aucune ligne, mettre à jour manuellement en remplaçant le nom exact :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT id, name FROM winelio.categories;\""
```
Puis UPDATE ciblé avec le vrai nom.

- [ ] **Step 4 : Installer signature_pad**

```bash
npm install signature_pad
```

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260415_is_hoguet_and_storage.sql package.json package-lock.json
git commit -m "feat(db): is_hoguet sur categories + bucket legal-signatures + install signature_pad"
```

---

### Task 2 : Composant `SignaturePad`

**Files:**
- Create: `src/components/SignaturePad.tsx`

- [ ] **Step 1 : Créer le composant**

```typescript
// src/components/SignaturePad.tsx
"use client";

import SignaturePadLib from "signature_pad";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

export interface SignaturePadRef {
  isEmpty(): boolean;
  toDataURL(): string;
  clear(): void;
}

const SignaturePad = forwardRef<SignaturePadRef, { className?: string }>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePadLib | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Ajuster la résolution du canvas à la taille affichée
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      padRef.current = new SignaturePadLib(canvas, {
        backgroundColor: "rgb(255,255,255)",
        penColor: "rgb(0,0,0)",
      });
      return () => {
        padRef.current?.off();
      };
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
      clear: () => padRef.current?.clear(),
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ touchAction: "none" }}
      />
    );
  }
);
SignaturePad.displayName = "SignaturePad";
export default SignaturePad;
```

- [ ] **Step 2 : Build pour vérifier les types**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: aucune erreur sur `SignaturePad.tsx`.

- [ ] **Step 3 : Commit**

```bash
git add src/components/SignaturePad.tsx
git commit -m "feat: composant SignaturePad (canvas wrapper signature_pad)"
```

---

### Task 3 : Génération PDF signé — `src/lib/generate-signed-pdf.ts`

**Files:**
- Create: `src/lib/generate-signed-pdf.ts`

Ce fichier génère un PDF HTML → weasyprint avec le contenu du document, la signature PNG incrustée, et le bloc de certification.

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/lib/generate-signed-pdf.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { supabaseAdmin } from "@/lib/supabase/admin";

const execFileAsync = promisify(execFile);

type GeneratePdfParams = {
  documentId: string;
  signerName: string;
  signatureImageUrl: string;
  signedAt: Date;
  ip: string;
  documentHash: string;
  documentVersion: string;
};

export async function generateSignedPDF(
  params: GeneratePdfParams
): Promise<Buffer> {
  const html = await buildSignedPdfHtml(params);
  const suffix = Date.now();
  const tmpHtml = join(tmpdir(), `winelio-sign-${suffix}.html`);
  const tmpPdf = join(tmpdir(), `winelio-sign-${suffix}.pdf`);

  try {
    await writeFile(tmpHtml, html, "utf-8");
    await execFileAsync("weasyprint", [tmpHtml, tmpPdf]);
    return await readFile(tmpPdf);
  } finally {
    await unlink(tmpHtml).catch(() => {});
    await unlink(tmpPdf).catch(() => {});
  }
}

async function buildSignedPdfHtml(params: GeneratePdfParams): Promise<string> {
  const { data: sections } = await supabaseAdmin
    .from("document_sections")
    .select("article_number, title, content")
    .eq("document_id", params.documentId)
    .order("order_index");

  const sectionsHtml = (sections ?? [])
    .map(
      (s) => `
    <div class="section">
      <h2>Article ${esc(s.article_number)} — ${esc(s.title)}</h2>
      <div class="content">${mdToHtml(s.content)}</div>
    </div>`
    )
    .join("\n");

  const signedAtStr = params.signedAt.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "full",
    timeStyle: "long",
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2cm; size: A4; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #2D3436; line-height: 1.6; }
  .header { text-align: center; border-bottom: 3px solid #FF6B35; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { color: #FF6B35; font-size: 16pt; margin: 8px 0 4px; }
  .header p { color: #636E72; font-size: 9pt; margin: 0; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 11pt; color: #FF6B35; border-bottom: 1px solid #F0F2F4; padding-bottom: 4px; }
  .content { font-size: 10pt; }
  .signature-block { margin-top: 40px; border: 2px solid #FF6B35; border-radius: 8px; padding: 20px; background: #FFF5F0; page-break-inside: avoid; }
  .signature-block h3 { color: #FF6B35; margin: 0 0 12px; font-size: 12pt; }
  .signature-block table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .signature-block td { padding: 4px 8px; vertical-align: top; }
  .signature-block td:first-child { color: #636E72; width: 35%; font-weight: bold; }
  .sig-img { border: 1px solid #ccc; background: white; max-width: 280px; max-height: 80px; }
  strong { color: #2D3436; }
  em { color: #636E72; }
</style>
</head>
<body>
  <div class="header">
    <p style="font-size:10pt;color:#FF6B35;font-weight:bold;letter-spacing:1px;">WINELIO</p>
    <h1>CGU Agents Immobiliers</h1>
    <p>Version ${esc(params.documentVersion)} — Document certifié</p>
  </div>

  ${sectionsHtml}

  <div class="signature-block">
    <h3>Certification de signature électronique</h3>
    <table>
      <tr>
        <td>Signataire</td>
        <td><strong>${esc(params.signerName)}</strong></td>
      </tr>
      <tr>
        <td>Date et heure</td>
        <td>${esc(signedAtStr)}</td>
      </tr>
      <tr>
        <td>Adresse IP</td>
        <td><code>${esc(params.ip)}</code></td>
      </tr>
      <tr>
        <td>Empreinte SHA-256</td>
        <td style="font-family:monospace;font-size:8pt;word-break:break-all;">${esc(params.documentHash)}</td>
      </tr>
      <tr>
        <td>Signature</td>
        <td><img src="${esc(params.signatureImageUrl)}" class="sig-img" alt="Signature" /></td>
      </tr>
    </table>
    <p style="font-size:8pt;color:#636E72;margin-top:12px;">
      Ce document constitue la preuve d'acceptation électronique des CGU Agents Immobiliers Winelio.
      L'empreinte SHA-256 certifie l'intégrité du document au moment de la signature.
    </p>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Conversion markdown minimal → HTML pour le PDF */
function mdToHtml(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^(\d+)\. /gm, (_, n) => `<br/>${n}. `)
    .replace(/^- /gm, "<br/>• ")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
```

- [ ] **Step 2 : Build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/generate-signed-pdf.ts
git commit -m "feat: generateSignedPDF via weasyprint avec bloc certification"
```

---

### Task 4 : Email de confirmation — `src/lib/notify-signature-cgu.ts`

**Files:**
- Create: `src/lib/notify-signature-cgu.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/lib/notify-signature-cgu.ts
import nodemailer from "nodemailer";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const _smtpPort = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: _smtpPort,
  secure: _smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

function buildSignatureEmail(firstName: string, signedAt: Date): string {
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const dateStr = signedAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vos CGU Agents Immobiliers — exemplaire signé</title>
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
                <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
                <tr><td align="center" style="padding-bottom:20px;"><span style="font-size:11px;color:#FF6B35;font-weight:600;letter-spacing:1px;">Recommandez. Connectez. Gagnez.</span></td></tr>
                <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">✍️</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Vos CGU ont été signées, ${he(firstName)} !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Vous avez signé électroniquement les CGU Agents Immobiliers Winelio le ${he(dateStr)}.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 12px 12px 0;padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#636E72;line-height:1.6;">
                      Un exemplaire certifié de votre contrat est joint à cet email (PDF). Conservez-le précieusement — il constitue la preuve de votre acceptation avec horodatage, empreinte cryptographique et signature.
                    </p>
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
                          <a href="${dashboardUrl}" style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Accéder à mon espace →
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
              <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p>
              <p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function notifySignatureCGU({
  email,
  firstName,
  pdfBuffer,
  signedAt,
}: {
  email: string;
  firstName: string;
  pdfBuffer: Buffer;
  signedAt: Date;
}): Promise<void> {
  await transporter.sendMail({
    from: `"Winelio" <${process.env.SMTP_USER || "support@winelio.app"}>`,
    to: email,
    subject: `${firstName}, vos CGU Agents Immobiliers sont signées ✍️`,
    html: buildSignatureEmail(firstName, signedAt),
    attachments: [
      {
        filename: "CGU-Agents-Immobiliers-Winelio-signe.pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
```

- [ ] **Step 2 : Build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add src/lib/notify-signature-cgu.ts
git commit -m "feat: email confirmation signature CGU avec PDF en pièce jointe"
```

---

### Task 5 : Server action `signAgentCGU`

**Files:**
- Create: `src/app/(protected)/profile/pro-onboarding/sign-action.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/app/(protected)/profile/pro-onboarding/sign-action.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuditContext,
  getDocumentHash,
  logOnboardingEvent,
} from "@/lib/audit";
import { generateSignedPDF } from "@/lib/generate-signed-pdf";
import { notifySignatureCGU } from "@/lib/notify-signature-cgu";

export async function signAgentCGU(params: {
  signatureBase64: string; // data URI image/png
  cguDocumentId: string;
}): Promise<{ success: true; pdfUrl: string } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Non authentifié" };

  const { ip, userAgent } = await getAuditContext();
  const signedAt = new Date();
  const timestamp = signedAt.getTime();

  // 1. Récupérer le profil
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, work_mode")
    .eq("id", user.id)
    .single();

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Agent Immobilier";

  // 2. Upload image signature
  const base64Data = params.signatureBase64.replace(
    /^data:image\/png;base64,/,
    ""
  );
  const signatureBuffer = Buffer.from(base64Data, "base64");
  const signaturePath = `signatures/${user.id}/signature-${timestamp}.png`;

  const { error: sigUploadError } = await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(signaturePath, signatureBuffer, { contentType: "image/png" });

  if (sigUploadError) {
    return { success: false, error: "Erreur upload signature : " + sigUploadError.message };
  }

  const { data: sigUrlData } = supabaseAdmin.storage
    .from("legal-signatures")
    .getPublicUrl(signaturePath);

  // 3. Hash SHA-256 du document
  const docHashData = await getDocumentHash(params.cguDocumentId);
  const documentHash = docHashData?.hash ?? "";
  const documentVersion = docHashData?.version ?? "1.0";

  // 4. Générer le PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateSignedPDF({
      documentId: params.cguDocumentId,
      signerName: fullName,
      signatureImageUrl: sigUrlData.publicUrl,
      signedAt,
      ip,
      documentHash,
      documentVersion,
    });
  } catch (err) {
    return {
      success: false,
      error: "Erreur génération PDF : " + (err instanceof Error ? err.message : String(err)),
    };
  }

  // 5. Upload PDF
  const pdfPath = `signed-documents/${user.id}/cgu-agents-immo-${timestamp}.pdf`;
  const { error: pdfUploadError } = await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });

  if (pdfUploadError) {
    return { success: false, error: "Erreur upload PDF : " + pdfUploadError.message };
  }

  const { data: pdfUrlData } = supabaseAdmin.storage
    .from("legal-signatures")
    .getPublicUrl(pdfPath);

  // 6. Log audit
  await logOnboardingEvent({
    userId: user.id,
    eventType: "signature_completed",
    ip,
    userAgent,
    documentId: params.cguDocumentId,
    documentVersion,
    documentHash,
    metadata: {
      signature_image_url: sigUrlData.publicUrl,
      pdf_url: pdfUrlData.publicUrl,
      signer_name: fullName,
    },
  });

  // 7. Activer le profil Pro
  await supabaseAdmin
    .from("profiles")
    .update({
      is_professional: true,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  // 8. Email confirmation (fire & forget)
  if (user.email) {
    notifySignatureCGU({
      email: user.email,
      firstName: profile?.first_name || "Agent",
      pdfBuffer,
      signedAt,
    }).catch((err) => console.error("notify-signature-cgu error:", err));
  }

  return { success: true, pdfUrl: pdfUrlData.publicUrl };
}
```

- [ ] **Step 2 : Build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add src/app/(protected)/profile/pro-onboarding/sign-action.ts
git commit -m "feat: server action signAgentCGU (upload, PDF, audit, activation, email)"
```

---

### Task 6 : Composant `SignatureModal`

**Files:**
- Create: `src/components/SignatureModal.tsx`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/components/SignatureModal.tsx
"use client";

import { useRef, useState } from "react";
import SignaturePad, { type SignaturePadRef } from "@/components/SignaturePad";
import { signAgentCGU } from "@/app/(protected)/profile/pro-onboarding/sign-action";

type Section = {
  article_number: string;
  title: string;
  content: string;
};

type Props = {
  cguDocumentId: string;
  sections: Section[];
  onSuccess: (pdfUrl: string) => void;
  onClose: () => void;
};

export function SignatureModal({ cguDocumentId, sections, onSuccess, onClose }: Props) {
  const padRef = useRef<SignaturePadRef>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDocScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledToBottom(true);
    }
  };

  const handleStrokeEnd = () => {
    setPadEmpty(padRef.current?.isEmpty() ?? true);
  };

  const handleClear = () => {
    padRef.current?.clear();
    setPadEmpty(true);
  };

  const handleSign = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSubmitting(true);
    setError(null);
    const signatureBase64 = padRef.current.toDataURL();
    const result = await signAgentCGU({ signatureBase64, cguDocumentId });
    if (!result.success) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onSuccess(result.pdfUrl);
  };

  const canSign = hasScrolledToBottom && !padEmpty;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <h2 className="text-lg font-bold text-gray-900">
          Signature des CGU Agents Immobiliers
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          aria-label="Fermer sans signer"
        >
          ×
        </button>
      </div>

      {/* Document scrollable (60%) */}
      <div
        onScroll={handleDocScroll}
        className="flex-[6] overflow-y-scroll bg-gray-50 px-8 py-6 text-sm text-gray-800 leading-relaxed"
      >
        {sections.map((s) => (
          <div key={s.article_number} className="mb-6">
            <h3 className="font-bold text-gray-900 mb-2">
              Article {s.article_number} — {s.title}
            </h3>
            <p className="whitespace-pre-wrap">{s.content}</p>
          </div>
        ))}
        {!hasScrolledToBottom && (
          <p className="text-center text-xs text-winelio-orange mt-4 mb-2">
            ↓ Faites défiler jusqu'en bas pour pouvoir signer
          </p>
        )}
      </div>

      {/* Zone de signature (40%) */}
      <div className="flex-[4] border-t border-gray-200 flex flex-col px-8 py-4 shrink-0">
        <p className="text-sm text-gray-600 mb-2">
          Signez dans le cadre ci-dessous :
        </p>
        <div
          className="border border-gray-300 rounded-lg flex-1 bg-white overflow-hidden"
          onPointerUp={handleStrokeEnd}
          onTouchEnd={handleStrokeEnd}
        >
          <SignaturePad
            ref={padRef}
            className="w-full h-full"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
        <div className="flex justify-between items-center mt-3">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Effacer
          </button>
          <button
            type="button"
            disabled={!canSign || submitting}
            onClick={handleSign}
            className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Signature en cours…" : "Je signe et j'accepte"}
          </button>
        </div>
        {!canSign && (
          <p className="text-xs text-gray-400 text-center mt-1">
            {!hasScrolledToBottom
              ? "Lisez le document jusqu'en bas"
              : "Dessinez votre signature"}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Build**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -10
```

- [ ] **Step 3 : Commit**

```bash
git add src/components/SignatureModal.tsx
git commit -m "feat: composant SignatureModal fullscreen (document + pad + action)"
```

---

### Task 7 : Intégrer dans le wizard pro-onboarding

**Files:**
- Modify: `src/app/(protected)/profile/pro-onboarding/page.tsx`
- Modify: `src/components/ProOnboardingWizard.tsx`

#### 7a — Modifier la page pour charger le document CGU AI et les catégories avec `is_hoguet`

- [ ] **Step 1 : Modifier `page.tsx`**

Remplacer le fichier entier :

```typescript
// src/app/(protected)/profile/pro-onboarding/page.tsx
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ProOnboardingWizard } from "@/components/ProOnboardingWizard";

export default async function ProOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, pro_engagement_accepted, work_mode")
    .eq("id", user.id)
    .single();

  if (profile?.pro_engagement_accepted) {
    redirect("/profile");
  }

  const [{ data: categories }, { data: company }, cguAiRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, is_hoguet")
      .order("name"),
    supabase
      .from("companies")
      .select("siret, category_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // CGU AI chargé via supabaseAdmin (RLS restreint aux super_admin)
    supabaseAdmin
      .from("legal_documents")
      .select("id, document_sections(article_number, title, content, order_index)")
      .eq("title", "CGU Agents Immobiliers")
      .eq("version", "1.0")
      .single(),
  ]);

  const cguAiDocument = cguAiRes.data ?? null;
  const cguAiSections = cguAiDocument
    ? [...(cguAiDocument.document_sections as { article_number: string; title: string; content: string; order_index: number }[])]
        .sort((a, b) => a.order_index - b.order_index)
        .map(({ article_number, title, content }) => ({ article_number, title, content }))
    : [];

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <ProOnboardingWizard
        categories={categories ?? []}
        defaultSiret={company?.siret ?? ""}
        defaultCategoryId={company?.category_id ?? ""}
        cguAiDocumentId={cguAiDocument?.id ?? null}
        cguAiSections={cguAiSections}
      />
    </div>
  );
}
```

#### 7b — Modifier `ProOnboardingWizard.tsx`

- [ ] **Step 2 : Remplacer le fichier entier**

```typescript
// src/components/ProOnboardingWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeProOnboarding } from "@/app/(protected)/profile/actions";
import { SignatureModal } from "@/components/SignatureModal";

type WorkMode = "remote" | "onsite" | "both";

interface Category {
  id: string;
  name: string;
  is_hoguet: boolean;
}

interface CguSection {
  article_number: string;
  title: string;
  content: string;
}

interface Props {
  categories: Category[];
  defaultSiret: string;
  defaultCategoryId: string;
  cguAiDocumentId: string | null;
  cguAiSections: CguSection[];
}

const WORK_MODES: { value: WorkMode; label: string; sub: string; icon: string }[] = [
  { value: "remote",  label: "Distanciel", sub: "En ligne",    icon: "💻" },
  { value: "onsite",  label: "Présentiel", sub: "En personne", icon: "🤝" },
  { value: "both",    label: "Les deux",   sub: "Flexible",    icon: "🌍" },
];

export function ProOnboardingWizard({
  categories,
  defaultSiret,
  defaultCategoryId,
  cguAiDocumentId,
  cguAiSections,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [siret, setSiret] = useState(defaultSiret);
  const [siretSkipped, setSiretSkipped] = useState(false);
  const [engagementChecked, setEngagementChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isHoguet = selectedCategory?.is_hoguet ?? false;

  const handleSubmitStandard = async () => {
    setSaving(true);
    setError(null);
    const result = await completeProOnboarding({
      work_mode: workMode!,
      category_id: categoryId,
      siret: siretSkipped ? null : siret.trim() || null,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/profile?pro=1");
    router.refresh();
  };

  const handleSignatureSuccess = (url: string) => {
    setShowSignatureModal(false);
    setPdfUrl(url);
    setStep(4); // étape de confirmation
  };

  // Étape de confirmation post-signature
  if (step === 4) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-winelio-dark">CGU signées avec succès !</h2>
        <p className="text-sm text-winelio-gray">
          Votre compte Pro Agent Immobilier est activé. Un exemplaire certifié vous a été envoyé par email.
        </p>
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-5 py-2.5 border border-winelio-orange text-winelio-orange font-medium rounded-xl hover:bg-orange-50 transition-colors text-sm"
          >
            Télécharger mon exemplaire (PDF)
          </a>
        )}
        <button
          type="button"
          onClick={() => { router.push("/profile?pro=1"); router.refresh(); }}
          className="block w-full px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          Accéder à mon espace →
        </button>
      </div>
    );
  }

  return (
    <>
      {showSignatureModal && cguAiDocumentId && (
        <SignatureModal
          cguDocumentId={cguAiDocumentId}
          sections={cguAiSections}
          onSuccess={handleSignatureSuccess}
          onClose={() => setShowSignatureModal(false)}
        />
      )}

      <div className="space-y-6">
        <StepBar current={step} />

        {step === 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <span className="inline-block bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
              ÉTAPE 1 / 3
            </span>
            <h2 className="text-xl font-bold text-winelio-dark mb-1">Comment tu travailles avec tes clients ?</h2>
            <p className="text-sm text-winelio-gray mb-6">Cela aide tes futurs clients à savoir comment te contacter.</p>
            <div className="grid grid-cols-3 gap-3">
              {WORK_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setWorkMode(m.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    workMode === m.value
                      ? "border-winelio-orange bg-orange-50"
                      : "border-gray-200 hover:border-winelio-orange/40"
                  }`}
                >
                  <span className="text-3xl">{m.icon}</span>
                  <span className={`text-sm font-semibold ${workMode === m.value ? "text-winelio-orange" : "text-winelio-dark"}`}>
                    {m.label}
                  </span>
                  <span className="text-xs text-winelio-gray">{m.sub}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={!workMode}
                onClick={() => setStep(2)}
                className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <Step2
            categories={categories}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            siret={siret}
            setSiret={setSiret}
            siretSkipped={siretSkipped}
            setSiretSkipped={setSiretSkipped}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          isHoguet ? (
            <Step3Hoguet
              onBack={() => setStep(2)}
              onSign={() => setShowSignatureModal(true)}
              cguAiDocumentId={cguAiDocumentId}
            />
          ) : (
            <Step3Standard
              checked={engagementChecked}
              setChecked={setEngagementChecked}
              saving={saving}
              error={error}
              onBack={() => setStep(2)}
              onSubmit={handleSubmitStandard}
            />
          )
        )}
      </div>
    </>
  );
}

function StepBar({ current }: { current: number }) {
  const steps = ["Mon activité", "Mon entreprise", "Engagement"];
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex-1 flex flex-col items-center gap-1 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span className={`text-xs font-medium ${active ? "text-winelio-orange" : "text-gray-400"}`}>
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`absolute top-4 left-1/2 w-full h-0.5 -z-10 ${done ? "bg-green-400" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step2({
  categories, categoryId, setCategoryId, siret, setSiret,
  siretSkipped, setSiretSkipped, onBack, onNext,
}: {
  categories: Category[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  siret: string;
  setSiret: (v: string) => void;
  siretSkipped: boolean;
  setSiretSkipped: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 2 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-6">Ton activité professionnelle</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Catégorie d&apos;activité <span className="text-winelio-orange">*</span>
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange bg-white"
          >
            <option value="">Sélectionner une catégorie…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-winelio-gray mb-1">
            Numéro SIRET{" "}
            <span className="text-gray-400 text-xs font-normal">(fortement recommandé)</span>
          </label>
          <input
            type="text"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            disabled={siretSkipped}
            placeholder="123 456 789 00012"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={() => { setSiretSkipped(!siretSkipped); setSiret(""); }}
            className="mt-1.5 text-xs text-winelio-orange hover:underline"
          >
            {siretSkipped ? "← Renseigner mon SIRET" : "Je n'ai pas encore de SIRET →"}
          </button>
        </div>
      </div>
      <div className="mt-6 flex justify-between">
        <button type="button" onClick={onBack} className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors">
          ← Retour
        </button>
        <button type="button" disabled={!categoryId} onClick={onNext} className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">
          Suivant →
        </button>
      </div>
    </div>
  );
}

function Step3Standard({
  checked, setChecked, saving, error, onBack, onSubmit,
}: {
  checked: boolean;
  setChecked: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 3 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-1">Tu as tout à gagner 🚀</h2>
      <p className="text-sm text-winelio-gray mb-4">Lis et accepte cet engagement pour activer ton compte Pro.</p>
      <div className="bg-orange-50 border-l-4 border-winelio-orange rounded-r-xl p-4 mb-5 text-sm text-winelio-dark leading-relaxed">
        Je m&apos;engage à traiter chaque recommandation avec sérieux et réactivité. Je comprends que chaque lead
        Winelio est une opportunité concrète d&apos;augmenter mon chiffre d&apos;affaires. Je m&apos;engage à suivre
        l&apos;avancement de chaque mission directement via l&apos;application Winelio, car c&apos;est ce qui me
        garantit d&apos;être recommandé à nouveau, de gagner en visibilité et de fidéliser ma clientèle sur le
        long terme.
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <div
          onClick={() => setChecked(!checked)}
          className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
            checked
              ? "bg-gradient-to-br from-winelio-orange to-winelio-amber border-winelio-orange"
              : "border-gray-300"
          }`}
        >
          {checked && <span className="text-white text-xs font-bold">✓</span>}
        </div>
        <span className="text-sm text-winelio-dark font-medium">
          J&apos;ai lu et j&apos;accepte cet engagement — je suis prêt à booster mon activité avec Winelio.
        </span>
      </label>
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}
      <div className="mt-6 flex justify-between items-center">
        <button type="button" onClick={onBack} className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors">
          ← Retour
        </button>
        <button
          type="button"
          disabled={!checked || saving}
          onClick={onSubmit}
          className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:opacity-90 transition-opacity disabled:opacity-40 text-base"
        >
          {saving ? "Activation…" : "🚀 Devenir Pro !"}
        </button>
      </div>
    </div>
  );
}

function Step3Hoguet({
  onBack,
  onSign,
  cguAiDocumentId,
}: {
  onBack: () => void;
  onSign: () => void;
  cguAiDocumentId: string | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <span className="inline-block bg-gray-200 text-gray-500 text-xs font-bold px-3 py-1 rounded-full mb-3">
        ÉTAPE 3 / 3
      </span>
      <h2 className="text-xl font-bold text-winelio-dark mb-1">Signature des CGU ✍️</h2>
      <p className="text-sm text-winelio-gray mb-4">
        En tant qu&apos;agent immobilier, vous êtes soumis à des Conditions Générales spécifiques.
        Leur acceptation se fait par signature électronique.
      </p>
      <div className="bg-orange-50 border-l-4 border-winelio-orange rounded-r-xl p-4 mb-5 text-sm text-winelio-dark leading-relaxed">
        Je m&apos;engage à traiter chaque recommandation avec sérieux et réactivité, conformément aux
        obligations de la loi Hoguet. Je comprends que la signature électronique qui suit a valeur
        contractuelle.
      </div>
      {!cguAiDocumentId && (
        <p className="text-sm text-red-600 mb-4">
          Document CGU introuvable — veuillez contacter le support Winelio.
        </p>
      )}
      <div className="mt-6 flex justify-between items-center">
        <button type="button" onClick={onBack} className="px-5 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors">
          ← Retour
        </button>
        <button
          type="button"
          disabled={!cguAiDocumentId}
          onClick={onSign}
          className="px-7 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:opacity-90 transition-opacity disabled:opacity-40 text-base"
        >
          ✍️ Signer les CGU
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Build complet**

```bash
npm run build 2>&1 | tail -30
```

Expected: compilation réussie, 0 erreurs TypeScript.

- [ ] **Step 4 : Commit**

```bash
git add src/app/(protected)/profile/pro-onboarding/page.tsx \
        src/components/ProOnboardingWizard.tsx
git commit -m "feat: intégrer SignatureModal dans le wizard pro-onboarding pour agents immobiliers"
```

---

### Task 8 : Test end-to-end + push

- [ ] **Step 1 : Vérifier que weasyprint est installé sur le VPS**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "which weasyprint || echo 'NOT FOUND'"
```

Si "NOT FOUND" :
```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 "pip3 install weasyprint"
```

- [ ] **Step 2 : Redémarrer le serveur dev local**

```bash
pm2 restart winelio
pm2 logs winelio --lines 10
```

- [ ] **Step 3 : Tester le flow agent immobilier**

1. Naviguer vers `http://localhost:3002/profile/pro-onboarding` avec un compte non-pro
2. Étape 1 : sélectionner un mode de travail
3. Étape 2 : sélectionner la catégorie "Agent immobilier" (marquée `is_hoguet = true`)
4. Étape 3 : vérifier que le bouton "Signer les CGU" apparaît (pas la checkbox)
5. Cliquer "Signer les CGU" → la modale fullscreen s'ouvre
6. Faire défiler le document jusqu'en bas
7. Dessiner une signature sur le canvas
8. Cliquer "Je signe et j'accepte"
9. Vérifier la page de confirmation + lien PDF
10. Vérifier que l'email a bien été envoyé (logs PM2)

- [ ] **Step 4 : Vérifier en DB**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT event_type, document_hash, metadata->>'pdf_url' FROM winelio.pro_onboarding_events WHERE event_type = 'signature_completed' ORDER BY created_at DESC LIMIT 3;\""
```

Expected: 1 ligne avec `signature_completed`, un hash SHA-256, et une URL PDF.

- [ ] **Step 5 : Push**

```bash
git push origin dev2
```
