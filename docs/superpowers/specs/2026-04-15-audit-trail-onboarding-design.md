# Spec — Audit trail onboarding professionnels (sous-projet 1/3)

**Date :** 2026-04-15
**Projet :** Winelio (`dev2`)
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Tout professionnel qui s'enregistre via le wizard "Passer Pro" doit laisser une trace auditée et immuable de chaque action significative : acceptation des CGU, engagement moral, SIRET renseigné, catégorie définie, activation Pro. En cas de litige, le super admin peut consulter la fiche du professionnel et voir l'historique complet avec IP, user agent, horodatage serveur et hash SHA-256 du document accepté.

Ce sous-projet est le socle des sous-projets 2 (CGU agents immobiliers) et 3 (flow e-signature).

---

## Base de données

### Table `winelio.pro_onboarding_events`

```sql
CREATE TABLE IF NOT EXISTS winelio.pro_onboarding_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES winelio.profiles(id),
  event_type       text NOT NULL CHECK (event_type IN (
                     'cgu_accepted',
                     'engagement_accepted',
                     'siret_provided',
                     'category_set',
                     'pro_activated',
                     'signature_completed'
                   )),
  ip_address       text,
  user_agent       text,
  document_id      uuid REFERENCES winelio.legal_documents(id),
  document_version text,
  document_hash    text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

**Règles :**
- Pas de `updated_at`, pas de trigger — ligne immuable une fois insérée
- `document_id`, `document_version`, `document_hash` : remplis uniquement pour les événements liés à un document (cgu_accepted, signature_completed)
- `metadata` : données complémentaires libres (ex: `{"siret": "..."}`, `{"category_id": "..."}`)

### Index

```sql
CREATE INDEX idx_pro_onboarding_events_user_id
  ON winelio.pro_onboarding_events(user_id, created_at DESC);
```

### RLS

- Lecture : super_admin uniquement
- Écriture : via service role uniquement (server actions)

---

## Utilitaires — `src/lib/audit.ts`

```typescript
import { headers } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getAuditContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? h.get("x-real-ip")
        ?? "unknown",
    userAgent: h.get("user-agent") ?? "unknown",
  };
}

export function hashDocument(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function getDocumentHash(documentId: string): Promise<{ hash: string; version: string } | null> {
  const { data: sections } = await supabaseAdmin
    .from("document_sections")
    .select("content")
    .eq("document_id", documentId)
    .order("order_index");

  const { data: doc } = await supabaseAdmin
    .from("legal_documents")
    .select("version")
    .eq("id", documentId)
    .single();

  if (!sections || !doc) return null;

  const fullContent = sections.map((s) => s.content).join("\n\n");
  return { hash: hashDocument(fullContent), version: doc.version };
}

type OnboardingEventPayload = {
  userId: string;
  eventType: "cgu_accepted" | "engagement_accepted" | "siret_provided" | "category_set" | "pro_activated" | "signature_completed";
  ip: string;
  userAgent: string;
  documentId?: string;
  documentVersion?: string;
  documentHash?: string;
  metadata?: Record<string, unknown>;
};

export async function logOnboardingEvent(payload: OnboardingEventPayload) {
  await supabaseAdmin.from("pro_onboarding_events").insert({
    user_id: payload.userId,
    event_type: payload.eventType,
    ip_address: payload.ip,
    user_agent: payload.userAgent,
    document_id: payload.documentId ?? null,
    document_version: payload.documentVersion ?? null,
    document_hash: payload.documentHash ?? null,
    metadata: payload.metadata ?? null,
  });
}
```

---

## Server action `completeProOnboarding()`

Fichier : `src/app/(protected)/profile/pro-onboarding/actions.ts`

La server action existante est enrichie :

```typescript
export async function completeProOnboarding(params: {
  work_mode: "remote" | "onsite" | "both";
  category_id: string;
  siret: string | null;
  cgu_document_id: string; // ID du document CGU accepté
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { ip, userAgent } = await getAuditContext();

  // 1. Calcul hash CGU
  const docHashData = await getDocumentHash(params.cgu_document_id);

  // 2. Mise à jour profil
  await supabaseAdmin.from("profiles").update({
    is_professional: true,
    work_mode: params.work_mode,
    pro_engagement_accepted: true,
  }).eq("id", user.id);

  // 3. Upsert company
  // ... logique existante inchangée ...

  // 4. Audit events
  const base = { userId: user.id, ip, userAgent };

  await logOnboardingEvent({ ...base, eventType: "category_set", metadata: { category_id: params.category_id } });

  if (params.siret) {
    await logOnboardingEvent({ ...base, eventType: "siret_provided", metadata: { siret: params.siret } });
  }

  await logOnboardingEvent({ ...base, eventType: "engagement_accepted" });

  await logOnboardingEvent({
    ...base,
    eventType: "cgu_accepted",
    documentId: params.cgu_document_id,
    documentVersion: docHashData?.version,
    documentHash: docHashData?.hash,
  });

  await logOnboardingEvent({ ...base, eventType: "pro_activated" });

  return { success: true };
}
```

---

## Composant `ProOnboardingAuditTimeline`

Fichier : `src/components/admin/ProOnboardingAuditTimeline.tsx`

Affiche la timeline dans la fiche pro super admin :

- Chaque événement : badge coloré par type + timestamp + IP + user agent parsé (ex: "Chrome 124 / macOS")
- Pour les événements avec `document_hash` : bouton "Vérifier l'intégrité" qui recalcule le hash du document actuel et compare
- Résultat vérification : ✅ "Document inchangé" ou ⚠️ "Document modifié depuis acceptation"

### Labels des event_type

| event_type | Label affiché | Couleur |
|---|---|---|
| `pro_activated` | Profil Pro activé | vert |
| `cgu_accepted` | CGU acceptées | bleu |
| `engagement_accepted` | Engagement moral accepté | bleu |
| `siret_provided` | SIRET renseigné | gris |
| `category_set` | Catégorie définie | gris |
| `signature_completed` | Signature électronique complétée | violet |

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260415_pro_onboarding_audit.sql` | Créer |
| `src/lib/audit.ts` | Créer |
| `src/app/(protected)/profile/pro-onboarding/actions.ts` | Modifier |
| `src/components/admin/ProOnboardingAuditTimeline.tsx` | Créer |
| `src/app/gestion-reseau/utilisateurs/[id]/page.tsx` | Modifier ou créer |

---

## Hors scope

- Rétro-audit des pros déjà enregistrés (données antérieures non disponibles)
- Export CSV de l'audit trail
- Alertes automatiques en cas de modification de document
- Signature électronique agents immobiliers (sous-projet 3)
