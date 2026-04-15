# Spec — Flow de signature électronique agents immobiliers (sous-projet 3/3)

**Date :** 2026-04-15
**Projet :** Winelio (`dev2`)
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Les agents immobiliers (profils soumis à la loi Hoguet) signent leurs CGU par voie électronique in-app, sans prestataire tiers. La signature est dessinée sur un pad canvas. Le résultat est archivé dans Supabase Storage (image de signature + PDF certifié) et tracé dans `pro_onboarding_events` (sous-projet 1).

Ce sous-projet dépend de :
- Sous-projet 1 : table `pro_onboarding_events` et `src/lib/audit.ts`
- Sous-projet 2 : document "CGU Agents Immobiliers" seedé dans `legal_documents`

---

## Déclenchement

Étape 3 du wizard `ProOnboardingWizard.tsx`, quand la catégorie sélectionnée est "agent immobilier" (ou tout profil soumis loi Hoguet) : au lieu de la checkbox CGU standard, un bouton **"Signer les CGU"** ouvre la modale de signature.

La détection se fait sur le `category_id` sélectionné à l'étape précédente du wizard, comparé aux catégories marquées comme "loi Hoguet".

---

## Modale de signature

### Layout

Modale fullscreen (`fixed inset-0 z-50 bg-white`) en deux zones :

**Zone haute (60% de hauteur)** :
- Document CGU Agents Immobiliers affiché en entier, scrollable (`overflow-y: scroll`, fond `bg-gray-50`, padding `16px`)
- Sections chargées depuis `document_sections` pour le document CGU Agents Immobiliers

**Zone basse (40% de hauteur)** :
- Instruction : "Signez dans le cadre ci-dessous"
- Canvas de signature (fond blanc, bordure `border border-gray-300 rounded-lg`)
- Bouton "Effacer" (réinitialise le canvas)
- Bouton **"Je signe et j'accepte"** — désactivé tant que :
  - le document n'a pas été scrollé jusqu'en bas (flag `hasScrolledToBottom`)
  - le canvas est vide (vérifié via `signaturePad.isEmpty()`)

### En-tête de la modale

- Titre : "Signature des CGU Agents Immobiliers"
- Croix de fermeture (ferme sans signer — n'active pas le compte)

---

## Librairie

**`signature_pad`** (npm `signature_pad`) — canvas HTML5, export PNG base64, zéro dépendance.

```bash
npm install signature_pad
```

---

## Server action `signAgentCGU()`

Fichier : `src/app/(protected)/profile/pro-onboarding/sign-action.ts`

```typescript
"use server";

export async function signAgentCGU(params: {
  signatureBase64: string;   // image/png base64 (data URI)
  cguDocumentId: string;     // ID du document CGU Agents Immobiliers
}) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { ip, userAgent } = await getAuditContext();
  const timestamp = Date.now();

  // 2. Upload image signature dans Supabase Storage
  const signatureBuffer = Buffer.from(
    params.signatureBase64.replace(/^data:image\/png;base64,/, ""),
    "base64"
  );
  const signaturePath = `signatures/${user.id}/signature-${timestamp}.png`;
  await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(signaturePath, signatureBuffer, { contentType: "image/png" });
  const { data: sigUrlData } = supabaseAdmin.storage
    .from("legal-signatures")
    .getPublicUrl(signaturePath);

  // 3. Hash SHA-256 du document
  const docHashData = await getDocumentHash(params.cguDocumentId);

  // 4. Génération PDF
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  const pdfBuffer = await generateSignedPDF({
    documentId: params.cguDocumentId,
    signerName: fullName,
    signatureImageUrl: sigUrlData.publicUrl,
    signedAt: new Date(),
    ip,
  });

  // 5. Upload PDF dans Supabase Storage
  const pdfPath = `signed-documents/${user.id}/cgu-agents-immo-${timestamp}.pdf`;
  await supabaseAdmin.storage
    .from("legal-signatures")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });
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
    documentVersion: docHashData?.version,
    documentHash: docHashData?.hash,
    metadata: {
      signature_image_url: sigUrlData.publicUrl,
      pdf_url: pdfUrlData.publicUrl,
      signer_name: fullName,
    },
  });

  // 7. Activation profil
  await supabaseAdmin.from("profiles").update({
    is_professional: true,
    pro_engagement_accepted: true,
  }).eq("id", user.id);

  // 8. Email confirmation (fire & forget)
  sendSignatureConfirmationEmail({
    to: user.email!,
    firstName: profile?.first_name ?? "",
    pdfUrl: pdfUrlData.publicUrl,
  }).catch(console.error);

  return { success: true, pdfUrl: pdfUrlData.publicUrl };
}
```

---

## Génération PDF — `generateSignedPDF()`

Fichier : `src/lib/generate-signed-pdf.ts`

Utilise **weasyprint** (déjà disponible sur le VPS) via `execFile` de Node.js (pas `exec` — pas de shell, pas d'injection).

```typescript
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function generateSignedPDF(params: {
  documentId: string;
  signerName: string;
  signatureImageUrl: string;
  signedAt: Date;
  ip: string;
}): Promise<Buffer> {
  const html = await buildSignedPdfHtml(params);
  const tmpHtml = join(tmpdir(), `sign-${Date.now()}.html`);
  const tmpPdf  = join(tmpdir(), `sign-${Date.now()}.pdf`);
  try {
    await writeFile(tmpHtml, html, "utf-8");
    await execFileAsync("weasyprint", [tmpHtml, tmpPdf]);
    return await readFile(tmpPdf);
  } finally {
    await unlink(tmpHtml).catch(() => {});
    await unlink(tmpPdf).catch(() => {});
  }
}
```

Structure du PDF généré :
- En-tête Winelio (logo + titre "CGU Agents Immobiliers v1.0")
- Corps : toutes les sections du document
- Bloc signature en bas de dernière page :
  - Image PNG de la signature dessinée
  - Nom complet du signataire
  - Date et heure de signature (ISO 8601)
  - Adresse IP
  - Empreinte SHA-256 du document

---

## Supabase Storage — bucket `legal-signatures`

Créer via migration SQL :

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-signatures', 'legal-signatures', true)
ON CONFLICT (id) DO NOTHING;
```

RLS : lecture publique (liens publics pour téléchargement) — écriture réservée au service role.

Structure des chemins :
```
legal-signatures/
  signatures/{userId}/signature-{timestamp}.png
  signed-documents/{userId}/cgu-agents-immo-{timestamp}.pdf
```

---

## UX après signature

La modale se ferme. Le wizard affiche un état de confirmation inline :
- Icône ✓ verte
- "CGU signées avec succès"
- Bouton "Télécharger mon exemplaire (PDF)" → lien vers `pdfUrl` (Supabase Storage)
- Redirect automatique vers `/dashboard` après 5 secondes (countdown affiché)

---

## Email de confirmation

Destinataire : email de l'agent
Sujet : "Vos CGU Agents Immobiliers — exemplaire signé"
Contenu :
- Charte visuelle Winelio standard (voir CLAUDE.md)
- Texte : "Vous avez signé les CGU Agents Immobiliers Winelio le [date]. Un exemplaire certifié est joint à cet email."
- Bouton CTA "Accéder à mon espace" → `/dashboard`
- PDF en pièce jointe (buffer, pas lien)

---

## Composants

### `SignaturePad.tsx`

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
      if (!canvasRef.current) return;
      padRef.current = new SignaturePadLib(canvasRef.current, {
        backgroundColor: "rgb(255,255,255)",
      });
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      return () => padRef.current?.off();
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL() ?? "",
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

### `SignatureModal.tsx`

Client component (`"use client"`) :
- `useRef<SignaturePadRef>` pour accéder au pad
- `useState<boolean>(false)` pour `hasScrolledToBottom`
- `onScroll` sur la zone document → set `hasScrolledToBottom` quand `scrollTop + clientHeight >= scrollHeight - 10`
- Submit → appelle `signAgentCGU()` → gère loading/error states
- `disabled={!hasScrolledToBottom || isPadEmpty}` sur le bouton de signature

---

## Migration SQL

Fichier : `supabase/migrations/20260415_legal_signatures_storage.sql`

```sql
-- Bucket Supabase Storage pour les signatures
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-signatures', 'legal-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- RLS : lecture publique, écriture service role seulement
CREATE POLICY "Public read legal-signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'legal-signatures');
```

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260415_legal_signatures_storage.sql` | Créer — bucket Storage |
| `supabase/seeds/legal_documents_cgu_agents_immo.sql` | Créer — seed 13 sections CGU AI |
| `src/components/SignaturePad.tsx` | Créer — canvas wrapper |
| `src/components/SignatureModal.tsx` | Créer — modale fullscreen |
| `src/lib/generate-signed-pdf.ts` | Créer — génération PDF weasyprint via execFile |
| `src/app/(protected)/profile/pro-onboarding/sign-action.ts` | Créer — server action signature |
| `src/app/(protected)/profile/pro-onboarding/ProOnboardingWizard.tsx` | Modifier — détecter catégorie AI, afficher SignatureModal |

---

## Hors scope v1

- Vérification validité carte T (API CCI)
- Signature qualifiée eIDAS niveau 2 ou 3
- Double signature (signataire + Winelio)
- Horodatage qualifié via tiers de confiance
- Re-signature en cas de mise à jour des CGU
