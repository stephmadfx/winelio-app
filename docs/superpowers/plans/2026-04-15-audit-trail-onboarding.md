# Audit Trail Onboarding Pro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enregistrer chaque action significative du wizard "Passer Pro" (IP, user agent, horodatage, hash SHA-256 du document CGU) dans une table immuable `pro_onboarding_events`, et afficher la timeline dans la fiche utilisateur super admin.

**Architecture:** Nouvelle table `winelio.pro_onboarding_events` (écriture service role uniquement, lecture super_admin). Utilitaires dans `src/lib/audit.ts`. La server action `completeProOnboarding` est enrichie pour logger 4-5 événements. Un composant client `ProOnboardingAuditTimeline` affiche la timeline dans `utilisateurs/[id]/page.tsx`.

**Tech Stack:** Next.js 15 App Router, Supabase self-hosted (schéma `winelio`), Node.js `crypto` (SHA-256), `next/headers` (IP/user-agent)

---

## Fichiers

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260415_pro_onboarding_audit.sql` | Créer |
| `src/lib/audit.ts` | Créer |
| `src/app/(protected)/profile/actions.ts` | Modifier (enrichir `completeProOnboarding`) |
| `src/components/admin/ProOnboardingAuditTimeline.tsx` | Créer |
| `src/app/gestion-reseau/utilisateurs/[id]/page.tsx` | Modifier (ajouter timeline) |

---

### Task 1 : Migration SQL `pro_onboarding_events`

**Files:**
- Create: `supabase/migrations/20260415_pro_onboarding_audit.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260415_pro_onboarding_audit.sql

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

CREATE INDEX IF NOT EXISTS idx_pro_onboarding_events_user_id
  ON winelio.pro_onboarding_events(user_id, created_at DESC);

ALTER TABLE winelio.pro_onboarding_events ENABLE ROW LEVEL SECURITY;

-- Lecture : super_admin uniquement
CREATE POLICY "super_admin_read_onboarding_events"
  ON winelio.pro_onboarding_events FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

-- Écriture : service role uniquement (server actions via supabaseAdmin)
-- Pas de policy INSERT/UPDATE/DELETE pour les rôles non-service
```

- [ ] **Step 2 : Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_pro_onboarding_audit.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_pro_onboarding_audit.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/20260415_pro_onboarding_audit.sql"
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` — pas d'erreurs.

- [ ] **Step 3 : Vérifier la table en DB**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"\\d winelio.pro_onboarding_events\""
```

Expected: liste des colonnes avec les types corrects.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260415_pro_onboarding_audit.sql
git commit -m "feat(db): table pro_onboarding_events pour audit trail onboarding"
```

---

### Task 2 : Utilitaires `src/lib/audit.ts`

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/lib/audit.ts
import { headers } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getAuditContext(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      "unknown",
    userAgent: h.get("user-agent") ?? "unknown",
  };
}

export function hashDocument(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function getDocumentHash(
  documentId: string
): Promise<{ hash: string; version: string } | null> {
  const [{ data: sections }, { data: doc }] = await Promise.all([
    supabaseAdmin
      .from("document_sections")
      .select("content")
      .eq("document_id", documentId)
      .order("order_index"),
    supabaseAdmin
      .from("legal_documents")
      .select("version")
      .eq("id", documentId)
      .single(),
  ]);

  if (!sections || !doc) return null;

  const fullContent = sections.map((s) => s.content).join("\n\n");
  return { hash: hashDocument(fullContent), version: doc.version };
}

type OnboardingEventPayload = {
  userId: string;
  eventType:
    | "cgu_accepted"
    | "engagement_accepted"
    | "siret_provided"
    | "category_set"
    | "pro_activated"
    | "signature_completed";
  ip: string;
  userAgent: string;
  documentId?: string;
  documentVersion?: string;
  documentHash?: string;
  metadata?: Record<string, unknown>;
};

export async function logOnboardingEvent(
  payload: OnboardingEventPayload
): Promise<void> {
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

- [ ] **Step 2 : Vérifier que le build ne casse pas**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors on the new file.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat(audit): utilitaires getAuditContext, hashDocument, logOnboardingEvent"
```

---

### Task 3 : Enrichir `completeProOnboarding()` avec les audit events

**Files:**
- Modify: `src/app/(protected)/profile/actions.ts`

La fonction actuelle (lignes 146–232) ne logue aucun événement. On y ajoute l'import des utilitaires et les 4-5 appels à `logOnboardingEvent`.

- [ ] **Step 1 : Ajouter l'import en haut du fichier**

Trouver la ligne `import { createClient } from "@/lib/supabase/server";` et ajouter après :

```typescript
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuditContext, getDocumentHash, logOnboardingEvent } from "@/lib/audit";
```

- [ ] **Step 2 : Modifier le corps de `completeProOnboarding`**

Remplacer la fonction entière (de `export async function completeProOnboarding` jusqu'à `return {};` final) par :

```typescript
export async function completeProOnboarding(data: {
  work_mode: "remote" | "onsite" | "both";
  category_id: string;
  siret: string | null;
}): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const supabase = await createClient();
  const { ip, userAgent } = await getAuditContext();

  // 1. Mettre à jour le profil
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      is_professional: true,
      work_mode: data.work_mode,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  if (profileError) return { error: "Erreur lors de la mise à jour du profil." };

  // 2. Récupérer le profil (nom + catégorie pour l'email)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const fallbackName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Mon entreprise";

  // 3. Vérifier/créer la company
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingCompany) {
    const patch: Record<string, string | null> = {};
    if (data.category_id) patch.category_id = data.category_id;
    if (data.siret !== null) patch.siret = data.siret;
    if (Object.keys(patch).length > 0) {
      const { error: companyError } = await supabase
        .from("companies")
        .update(patch)
        .eq("id", existingCompany.id);
      if (companyError) return { error: "Erreur lors de la mise à jour de l'entreprise." };
    }
  } else {
    const { generateUniqueAlias } = await import("@/lib/generate-alias");
    const alias = await generateUniqueAlias(supabase);
    const { error: companyError } = await supabase.from("companies").insert({
      owner_id: user.id,
      name: fallbackName,
      category_id: data.category_id || null,
      siret: data.siret || null,
      alias,
    });
    if (companyError) return { error: "Erreur lors de la création de l'entreprise." };
  }

  // 4. Email de confirmation (non bloquant)
  if (user.email) {
    const { data: category } = await supabase
      .from("categories")
      .select("name")
      .eq("id", data.category_id)
      .maybeSingle();
    const { notifyProOnboarding } = await import("@/lib/notify-pro-onboarding");
    notifyProOnboarding({
      email: user.email,
      firstName: profile?.first_name || profile?.last_name || "Professionnel",
      workMode: data.work_mode,
      categoryName: category?.name || "—",
    }).catch((err) => console.error("notify-pro-onboarding error:", err));
  }

  // 5. Audit trail
  const base = { userId: user.id, ip, userAgent };

  // Chercher le document CGU Professionnels pour le hash
  const { data: cguDoc } = await supabaseAdmin
    .from("legal_documents")
    .select("id")
    .eq("title", "CGU Professionnels")
    .eq("version", "1.0")
    .maybeSingle();

  const docHashData = cguDoc ? await getDocumentHash(cguDoc.id) : null;

  await logOnboardingEvent({
    ...base,
    eventType: "category_set",
    metadata: { category_id: data.category_id },
  });

  if (data.siret) {
    await logOnboardingEvent({
      ...base,
      eventType: "siret_provided",
      metadata: { siret: data.siret },
    });
  }

  await logOnboardingEvent({ ...base, eventType: "engagement_accepted" });

  await logOnboardingEvent({
    ...base,
    eventType: "cgu_accepted",
    documentId: cguDoc?.id,
    documentVersion: docHashData?.version ?? undefined,
    documentHash: docHashData?.hash ?? undefined,
  });

  await logOnboardingEvent({ ...base, eventType: "pro_activated" });

  return {};
}
```

- [ ] **Step 3 : Build pour vérifier**

```bash
npm run build 2>&1 | tail -20
```

Expected: compilation réussie, pas d'erreur TypeScript.

- [ ] **Step 4 : Commit**

```bash
git add src/app/(protected)/profile/actions.ts
git commit -m "feat(audit): loguer les événements onboarding dans completeProOnboarding"
```

---

### Task 4 : Composant `ProOnboardingAuditTimeline`

**Files:**
- Create: `src/components/admin/ProOnboardingAuditTimeline.tsx`

Ce composant client reçoit les events en prop (chargés côté serveur par la page) et gère le bouton "Vérifier l'intégrité" via un server action.

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/components/admin/ProOnboardingAuditTimeline.tsx
"use client";

import { useState } from "react";
import { verifyDocumentIntegrity } from "@/app/gestion-reseau/utilisateurs/[id]/audit-actions";

export type OnboardingEvent = {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  document_id: string | null;
  document_version: string | null;
  document_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EVENT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pro_activated:        { label: "Profil Pro activé",                  color: "text-emerald-400",  bg: "bg-emerald-500/10" },
  cgu_accepted:         { label: "CGU acceptées",                      color: "text-blue-400",     bg: "bg-blue-500/10" },
  engagement_accepted:  { label: "Engagement moral accepté",           color: "text-blue-400",     bg: "bg-blue-500/10" },
  siret_provided:       { label: "SIRET renseigné",                    color: "text-gray-300",     bg: "bg-white/5" },
  category_set:         { label: "Catégorie définie",                  color: "text-gray-300",     bg: "bg-white/5" },
  signature_completed:  { label: "Signature électronique complétée",   color: "text-violet-400",   bg: "bg-violet-500/10" },
};

function parseUserAgent(ua: string | null): string {
  if (!ua || ua === "unknown") return "Inconnu";
  const chrome = ua.match(/Chrome\/(\d+)/);
  const firefox = ua.match(/Firefox\/(\d+)/);
  const safari = !chrome && ua.match(/Version\/(\d+).*Safari/);
  const mac = /Mac OS X/.test(ua);
  const windows = /Windows NT/.test(ua);
  const os = mac ? "macOS" : windows ? "Windows" : "Linux";
  if (chrome) return `Chrome ${chrome[1]} / ${os}`;
  if (firefox) return `Firefox ${firefox[1]} / ${os}`;
  if (safari) return `Safari ${(safari as RegExpMatchArray)[1]} / ${os}`;
  return os;
}

function EventRow({ event }: { event: OnboardingEvent }) {
  const cfg = EVENT_CONFIG[event.event_type] ?? {
    label: event.event_type,
    color: "text-gray-300",
    bg: "bg-white/5",
  };
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"unchanged" | "modified" | null>(null);

  const handleVerify = async () => {
    if (!event.document_id || !event.document_hash) return;
    setVerifying(true);
    try {
      const result = await verifyDocumentIntegrity(event.document_id, event.document_hash);
      setVerifyResult(result.unchanged ? "unchanged" : "modified");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex gap-3 items-start">
      {/* Dot + ligne verticale */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.bg} border border-current ${cfg.color}`} />
      </div>
      {/* Contenu */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(event.created_at).toLocaleString("fr-FR")}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500 space-y-0.5">
          {event.ip_address && (
            <div>IP : <span className="text-gray-300 font-mono">{event.ip_address}</span></div>
          )}
          {event.user_agent && (
            <div>Agent : <span className="text-gray-300">{parseUserAgent(event.user_agent)}</span></div>
          )}
          {event.document_version && (
            <div>Document v{event.document_version}</div>
          )}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="font-mono text-gray-400">
              {Object.entries(event.metadata).map(([k, v]) => (
                <span key={k} className="mr-3">{k}: {String(v)}</span>
              ))}
            </div>
          )}
        </div>
        {event.document_hash && event.document_id && (
          <div className="mt-2">
            {verifyResult === null ? (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="text-xs text-winelio-orange hover:underline disabled:opacity-50"
              >
                {verifying ? "Vérification…" : "Vérifier l'intégrité du document"}
              </button>
            ) : verifyResult === "unchanged" ? (
              <span className="text-xs text-emerald-400">✅ Document inchangé</span>
            ) : (
              <span className="text-xs text-yellow-400">⚠️ Document modifié depuis l'acceptation</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProOnboardingAuditTimeline({ events }: { events: OnboardingEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-600 italic">Aucun événement d'onboarding enregistré.</p>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2 : Créer le server action de vérification**

```typescript
// src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts
"use server";

import { getDocumentHash } from "@/lib/audit";

export async function verifyDocumentIntegrity(
  documentId: string,
  storedHash: string
): Promise<{ unchanged: boolean }> {
  const current = await getDocumentHash(documentId);
  if (!current) return { unchanged: false };
  return { unchanged: current.hash === storedHash };
}
```

- [ ] **Step 3 : Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: pas d'erreurs.

- [ ] **Step 4 : Commit**

```bash
git add src/components/admin/ProOnboardingAuditTimeline.tsx \
        src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts
git commit -m "feat(admin): composant ProOnboardingAuditTimeline + action verifyDocumentIntegrity"
```

---

### Task 5 : Intégrer la timeline dans la fiche utilisateur super admin

**Files:**
- Modify: `src/app/gestion-reseau/utilisateurs/[id]/page.tsx`

La page actuelle (lignes 1–279) charge profil, wallet, company. On ajoute le chargement des events et le rendu de la timeline pour les professionnels.

- [ ] **Step 1 : Ajouter l'import du composant**

En haut du fichier, après l'import existant `import { supabaseAdmin }...`, ajouter :

```typescript
import {
  ProOnboardingAuditTimeline,
  type OnboardingEvent,
} from "@/components/admin/ProOnboardingAuditTimeline";
```

- [ ] **Step 2 : Ajouter le chargement des events dans le `Promise.all`**

Remplacer le `Promise.all` existant (lignes 16–42) par :

```typescript
const [profileRes, walletRes, recoCountRes, sponsorCountRes, companyRes, eventsRes] =
  await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*, sponsor:profiles!sponsor_id(first_name, last_name)")
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("user_wallet_summaries")
      .select("*")
      .eq("user_id", id)
      .single(),
    supabaseAdmin
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", id),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("sponsor_id", id),
    supabaseAdmin
      .from("companies")
      .select("name, legal_name, alias, siret, siren, vat_number, email, phone, website, address, city, postal_code, is_verified")
      .eq("owner_id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("pro_onboarding_events")
      .select("id, event_type, ip_address, user_agent, document_id, document_version, document_hash, metadata, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: true }),
  ]);
```

- [ ] **Step 3 : Extraire la variable events**

Juste après la ligne `const sponsor = ...`, ajouter :

```typescript
const onboardingEvents = (eventsRes.data ?? []) as OnboardingEvent[];
```

- [ ] **Step 4 : Ajouter le bloc timeline dans le JSX**

Après le bloc `{/* Wallet */}` (après la div fermante `</div>` du wallet, avant le bloc `{/* Actions */}`), ajouter :

```tsx
{/* Audit trail onboarding */}
{profile.is_professional && (
  <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
      Audit trail onboarding
    </h2>
    <ProOnboardingAuditTimeline events={onboardingEvents} />
  </div>
)}
```

- [ ] **Step 5 : Build + vérification**

```bash
npm run build 2>&1 | tail -20
```

Expected: compilation réussie.

- [ ] **Step 6 : Commit**

```bash
git add src/app/gestion-reseau/utilisateurs/[id]/page.tsx
git commit -m "feat(admin): afficher l'audit trail onboarding dans la fiche utilisateur"
```

---

### Task 6 : Test end-to-end + push

- [ ] **Step 1 : Vérifier le serveur dev PM2**

```bash
pm2 list
```

Si `winelio` est absent ou stopped :
```bash
pm2 start winelio
```

- [ ] **Step 2 : Tester le wizard onboarding**

Naviguer vers `http://localhost:3002/profile/pro-onboarding` avec un compte non-pro.
Compléter les 3 étapes et soumettre.

Vérifier en DB que les events ont bien été créés :

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
  -c \"SELECT event_type, ip_address, document_hash, created_at FROM winelio.pro_onboarding_events ORDER BY created_at DESC LIMIT 10;\""
```

Expected: 4-5 lignes (category_set, siret_provided?, engagement_accepted, cgu_accepted, pro_activated).

- [ ] **Step 3 : Tester la timeline admin**

Naviguer vers `http://localhost:3002/gestion-reseau/utilisateurs/[id-du-pro]`.
Vérifier que la section "Audit trail onboarding" apparaît avec les événements.
Cliquer "Vérifier l'intégrité" sur l'événement `cgu_accepted` → devrait afficher ✅ "Document inchangé".

- [ ] **Step 4 : Push**

```bash
git push origin dev2
```
