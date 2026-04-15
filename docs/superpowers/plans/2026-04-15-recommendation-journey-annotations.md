# Recommendation Journey Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une vue visuelle enrichie du parcours d'une recommandation avec annotations par étape et commentaires généraux dans le super admin.

**Architecture:** La page `/gestion-reseau/recommandations/[id]` est refactorisée en composant Client `RecoJourneyView` recevant toutes les données et actions en props depuis le Server Component. Un nouveau fichier `actions.ts` dédié gère les Server Actions annotation. La table `recommendation_annotations` stocke les notes par étape ou sur la recommandation entière.

**Tech Stack:** Next.js 15 App Router, Supabase (schéma `winelio`, `supabaseAdmin`), Tailwind CSS v4, TypeScript, `useTransition` pour optimistic UI.

---

## Contexte codebase essentiel

**Supabase** : `supabaseAdmin` est pré-configuré avec `db: { schema: "winelio" }` — ne jamais ajouter `.schema("winelio")` dans les queries.

**Pattern Server Actions** : chaque action commence par `await assertSuperAdmin()` (helper privé dans le fichier). Voir `src/app/gestion-reseau/actions.ts` pour le pattern exact.

**Pattern composant** : `DocumentViewer` (`src/components/admin/DocumentViewer.tsx`) est la référence de style pour les composants admin avec annotations. Les couleurs d'auteurs sont calculées dans le Server Component par ordre d'apparition et passées en map `authorId → colorClasses`.

**Tailwind classes dynamiques** : toujours écrire les noms de classes Tailwind complets dans le code source. ❌ `border-${color}` ✅ `border-winelio-orange`.

**Schéma DB actuel** : table `recommendations` a les colonnes `id`, `status`, `amount`, `compensation_plan_id`, `referrer_id`, `professional_id`. Table `recommendation_steps` a `id`, `completed_at`, FK vers `steps` (qui a `order_index`, `name`).

---

## Structure des fichiers

| Fichier | Action | Rôle |
|---------|--------|------|
| `supabase/migrations/20260415_recommendation_annotations.sql` | Créer | Table `recommendation_annotations` |
| `src/app/gestion-reseau/recommandations/[id]/actions.ts` | Créer | `addRecoAnnotation`, `deleteRecoAnnotation` |
| `src/components/admin/RecoJourneyView.tsx` | Créer | Composant Client complet (onglets, timeline, annotations) |
| `src/app/gestion-reseau/recommandations/[id]/page.tsx` | Modifier | Charger annotations + admin ID, rendre `RecoJourneyView` |

---

## Task 1 : Migration DB — table recommendation_annotations

**Files:**
- Create: `supabase/migrations/20260415_recommendation_annotations.sql`

- [ ] **Step 1 : Créer le fichier de migration**

```sql
-- supabase/migrations/20260415_recommendation_annotations.sql

CREATE TABLE IF NOT EXISTS winelio.recommendation_annotations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id      UUID NOT NULL
    REFERENCES winelio.recommendations(id) ON DELETE CASCADE,
  recommendation_step_id UUID
    REFERENCES winelio.recommendation_steps(id) ON DELETE CASCADE,
  -- NULL = commentaire général sur la recommandation entière
  author_id              UUID NOT NULL
    REFERENCES winelio.profiles(id),
  content                TEXT NOT NULL
    CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reco_annotations_reco_id
  ON winelio.recommendation_annotations(recommendation_id, created_at);

ALTER TABLE winelio.recommendation_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_reco_annotations"
  ON winelio.recommendation_annotations FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  );
```

- [ ] **Step 2 : Appliquer la migration sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260415_recommendation_annotations.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260415_recommendation_annotations.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -f /tmp/20260415_recommendation_annotations.sql"
```

Résultat attendu : `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` sans erreur.

- [ ] **Step 3 : Vérifier la table**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c '\d winelio.recommendation_annotations'"
```

Résultat attendu : 6 colonnes listées (`id`, `recommendation_id`, `recommendation_step_id`, `author_id`, `content`, `created_at`).

- [ ] **Step 4 : Commiter**

```bash
git add supabase/migrations/20260415_recommendation_annotations.sql
git commit -m "feat(db): table recommendation_annotations — annotations par étape et générales"
```

---

## Task 2 : Server Actions — addRecoAnnotation & deleteRecoAnnotation

**Files:**
- Create: `src/app/gestion-reseau/recommandations/[id]/actions.ts`

- [ ] **Step 1 : Créer le fichier**

```typescript
// src/app/gestion-reseau/recommandations/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  if (user.app_metadata?.role !== "super_admin") throw new Error("Accès refusé");
  return user;
}

export async function addRecoAnnotation(
  recommendationId: string,
  stepId: string | null,
  content: string
): Promise<void> {
  const user = await assertSuperAdmin();

  if (!content.trim() || content.length > 1000) {
    throw new Error("Contenu invalide (1–1000 caractères)");
  }

  const { error } = await supabaseAdmin
    .from("recommendation_annotations")
    .insert({
      recommendation_id: recommendationId,
      recommendation_step_id: stepId,
      author_id: user.id,
      content: content.trim(),
    });

  if (error) throw new Error(`Erreur ajout annotation: ${error.message}`);
  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
}

export async function deleteRecoAnnotation(annotationId: string): Promise<void> {
  const user = await assertSuperAdmin();

  // Récupérer author_id ET recommendation_id en une seule query
  const { data: ann } = await supabaseAdmin
    .from("recommendation_annotations")
    .select("author_id, recommendation_id")
    .eq("id", annotationId)
    .single();

  if (!ann) throw new Error("Annotation introuvable");
  if (ann.author_id !== user.id) throw new Error("Suppression non autorisée");

  const { error } = await supabaseAdmin
    .from("recommendation_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) throw new Error(`Erreur suppression annotation: ${error.message}`);
  revalidatePath(`/gestion-reseau/recommandations/${ann.recommendation_id}`);
}
```

- [ ] **Step 2 : Vérifier que le fichier compile (pas d'erreur TypeScript)**

```bash
npx tsc --noEmit 2>&1 | grep "recommandations/\[id\]/actions" | head -10
```

Résultat attendu : aucune ligne (zéro erreur sur ce fichier).

- [ ] **Step 3 : Commiter**

```bash
git add src/app/gestion-reseau/recommandations/[id]/actions.ts
git commit -m "feat(actions): addRecoAnnotation + deleteRecoAnnotation avec garde author_id"
```

---

## Task 3 : Composant RecoJourneyView

**Files:**
- Create: `src/components/admin/RecoJourneyView.tsx`

- [ ] **Step 1 : Créer le composant complet**

```typescript
// src/components/admin/RecoJourneyView.tsx
"use client";

import { useState, useTransition } from "react";

// ── Types exportés (utilisés par page.tsx) ──────────────────────────────────

export type AuthorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type AnnotationRow = {
  id: string;
  recommendation_step_id: string | null;
  content: string;
  created_at: string;
  author: AuthorRow | null;
};

export type StepRow = {
  id: string;
  completed_at: string | null;
  step: { order_index: number; name: string };
};

export type RecoSummary = {
  id: string;
  status: string;
  amount: number | null;
  commission_rate: number | null;
  referrer: { first_name: string | null; last_name: string | null; email: string | null } | null;
  professional: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

// ── Couleurs auteurs ─────────────────────────────────────────────────────────
// Classes Tailwind complètes — ne pas construire dynamiquement
const AUTHOR_COLORS = [
  { text: "text-winelio-orange", border: "border-winelio-orange" },
  { text: "text-blue-400",       border: "border-blue-400"       },
  { text: "text-green-400",      border: "border-green-400"      },
  { text: "text-purple-400",     border: "border-purple-400"     },
  { text: "text-yellow-400",     border: "border-yellow-400"     },
] as const;

const VALID_STATUSES = [
  "PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED", "COMPLETED", "CANCELLED",
] as const;

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  reco: RecoSummary;
  steps: StepRow[];
  annotations: AnnotationRow[];
  currentAdminId: string;
  onAddAnnotation: (recommendationId: string, stepId: string | null, content: string) => Promise<void>;
  onDeleteAnnotation: (annotationId: string) => Promise<void>;
  onAdvanceStep: (recommendationId: string, stepId: string) => Promise<void>;
  onToggleStatus: (recommendationId: string, status: string) => Promise<void>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function authorName(author: AuthorRow | null): string {
  if (!author) return "Admin";
  return `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim() || "Admin";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// ── Composant ────────────────────────────────────────────────────────────────

export function RecoJourneyView({
  reco,
  steps,
  annotations,
  currentAdminId,
  onAddAnnotation,
  onDeleteAnnotation,
  onAdvanceStep,
  onToggleStatus,
}: Props) {
  const [activeTab, setActiveTab] = useState<"parcours" | "actions">("parcours");
  const [pendingStepId, setPendingStepId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generalInput, setGeneralInput] = useState("");
  const [stepInputs, setStepInputs] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  // Couleurs par auteur (ordre d'apparition dans les annotations)
  const authorOrder: string[] = [];
  for (const ann of annotations) {
    const id = ann.author?.id;
    if (id && !authorOrder.includes(id)) authorOrder.push(id);
  }
  const authorColorMap = Object.fromEntries(
    authorOrder.map((id, i) => [id, AUTHOR_COLORS[i % AUTHOR_COLORS.length]])
  );

  function getColor(authorId: string | undefined) {
    return authorId ? (authorColorMap[authorId] ?? AUTHOR_COLORS[0]) : AUTHOR_COLORS[0];
  }

  const generalAnnotations = annotations.filter(a => a.recommendation_step_id === null);

  function stepAnnotations(stepId: string) {
    return annotations.filter(a => a.recommendation_step_id === stepId);
  }

  // Étape active = première non complétée
  const activeStepId = steps.find(s => !s.completed_at)?.id ?? null;

  // Commission calculée
  const commissionAmount =
    reco.amount && reco.commission_rate
      ? Math.round(reco.amount * (reco.commission_rate / 100) * 100) / 100
      : null;

  async function handleAddAnnotation(stepId: string | null) {
    const content = stepId ? (stepInputs[stepId] ?? "") : generalInput;
    if (!content.trim()) return;
    startTransition(async () => {
      await onAddAnnotation(reco.id, stepId, content);
      if (stepId) {
        setStepInputs(prev => ({ ...prev, [stepId]: "" }));
      } else {
        setGeneralInput("");
      }
    });
  }

  async function handleDelete(annotationId: string) {
    setDeletingId(annotationId);
    startTransition(async () => {
      await onDeleteAnnotation(annotationId);
      setDeletingId(null);
    });
  }

  async function handleAdvanceStep(stepId: string) {
    setPendingStepId(stepId);
    startTransition(async () => {
      await onAdvanceStep(reco.id, stepId);
      setPendingStepId(null);
    });
  }

  // ── Sous-composant : bulle d'annotation ──────────────────────────────────

  function AnnotationBubble({ ann }: { ann: AnnotationRow }) {
    const color = getColor(ann.author?.id);
    const isOwn = ann.author?.id === currentAdminId;
    return (
      <div className={`text-sm text-foreground bg-black/20 rounded-lg px-3 py-2 border-l-2 ${color.border} flex justify-between items-start gap-2`}>
        <div className="min-w-0">
          <span className={`font-semibold ${color.text}`}>{authorName(ann.author)}</span>
          <span className="text-muted-foreground text-xs"> · {formatDate(ann.created_at)}</span>
          <span className="text-muted-foreground"> — {ann.content}</span>
        </div>
        {isOwn && (
          <button
            onClick={() => handleDelete(ann.id)}
            disabled={deletingId === ann.id}
            className="text-muted-foreground/40 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none disabled:opacity-50"
            title="Supprimer mon annotation"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ── Sous-composant : champ ajout annotation ───────────────────────────────

  function AnnotationInput({ stepId }: { stepId: string | null }) {
    const value = stepId ? (stepInputs[stepId] ?? "") : generalInput;
    const setValue = (v: string) => {
      if (stepId) {
        setStepInputs(prev => ({ ...prev, [stepId]: v }));
      } else {
        setGeneralInput(v);
      }
    };
    return (
      <div className="flex gap-2 mt-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddAnnotation(stepId); } }}
          placeholder={stepId ? "Annoter cette étape…" : "Ajouter un commentaire…"}
          maxLength={1000}
          className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-winelio-orange/50 transition-colors"
        />
        <button
          onClick={() => handleAddAnnotation(stepId)}
          disabled={!value.trim()}
          className="bg-gradient-to-br from-winelio-orange to-winelio-amber text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          +
        </button>
      </div>
    );
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  const referrerName = reco.referrer
    ? `${reco.referrer.first_name ?? ""} ${reco.referrer.last_name ?? ""}`.trim() || reco.referrer.email || "—"
    : "—";
  const professionalName = reco.professional
    ? `${reco.professional.first_name ?? ""} ${reco.professional.last_name ?? ""}`.trim() || reco.professional.email || "—"
    : "—";

  return (
    <div className="max-w-2xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-muted-foreground">
        <a href="/gestion-reseau/recommandations" className="hover:text-winelio-orange transition-colors">
          ← Recommandations
        </a>
        <span className="text-border">/</span>
        <span className="text-foreground font-semibold">{referrerName} → {professionalName}</span>
        <span className="ml-auto bg-winelio-orange/10 text-winelio-orange text-xs font-semibold px-2.5 py-1 rounded-full">
          {reco.status}
        </span>
      </div>

      <div className="bg-card border border-border rounded-2xl">

        {/* ── Entête : infos synthèse ─────────────────────────────────── */}
        <div className="p-5 border-b border-border">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Referrer",      value: referrerName,      className: "text-foreground" },
              { label: "Professionnel", value: professionalName,  className: "text-foreground" },
              { label: "Montant deal",  value: reco.amount ? `${Number(reco.amount).toLocaleString("fr-FR")} €` : "—", className: "text-green-400 font-bold" },
              { label: "Commission",    value: commissionAmount ? `${commissionAmount.toLocaleString("fr-FR")} €` : "—", className: "text-winelio-orange font-bold" },
            ].map(({ label, value, className }) => (
              <div key={label} className="bg-background/50 border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-sm ${className}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Zone commentaires généraux */}
          <div className="bg-background/30 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-xs font-semibold text-muted-foreground">Commentaires généraux</span>
              {generalAnnotations.length > 0 && (
                <span className="bg-white/5 text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                  {generalAnnotations.length}
                </span>
              )}
            </div>
            <div className="space-y-2 mb-1">
              {generalAnnotations.map(ann => <AnnotationBubble key={ann.id} ann={ann} />)}
            </div>
            <AnnotationInput stepId={null} />
          </div>
        </div>

        {/* ── Onglets ─────────────────────────────────────────────────── */}
        <div className="flex border-b border-border px-5">
          <button
            onClick={() => setActiveTab("parcours")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "parcours"
                ? "text-winelio-orange border-winelio-orange"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Parcours
          </button>
          <button
            onClick={() => setActiveTab("actions")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "actions"
                ? "text-winelio-orange border-winelio-orange"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Infos & Actions
          </button>
        </div>

        {/* ── Onglet Parcours ──────────────────────────────────────────── */}
        {activeTab === "parcours" && (
          <div className="p-5 space-y-3">
            {steps.map((step, index) => {
              const isDone    = !!step.completed_at;
              const isActive  = step.id === activeStepId;
              const isFuture  = !isDone && !isActive;
              const isLast    = index === steps.length - 1;
              const anns      = stepAnnotations(step.id);

              return (
                <div key={step.id} className="flex gap-3 items-stretch">

                  {/* Connecteur vertical */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isDone   ? "bg-green-500 text-white" :
                      isActive ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white ring-4 ring-winelio-orange/20" :
                                 "bg-white/5 border border-white/10 text-muted-foreground"
                    }`}>
                      {isDone ? "✓" : step.step.order_index}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 mt-1 ${isDone ? "bg-green-500/40" : "bg-border"}`} />
                    )}
                  </div>

                  {/* Carte étape */}
                  <div className={`flex-1 rounded-xl border p-3 mb-1 ${
                    isDone   ? "bg-green-500/5 border-green-500/15" :
                    isActive ? "bg-winelio-orange/7 border-winelio-orange/25" :
                               "bg-white/2 border-white/5 opacity-40"
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`text-sm font-semibold ${
                        isDone ? "text-green-400" : isActive ? "text-winelio-orange" : "text-muted-foreground"
                      }`}>
                        {step.step.order_index} — {step.step.name}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isDone && step.completed_at && (
                          <span className="text-xs text-muted-foreground">{formatDate(step.completed_at)}</span>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleAdvanceStep(step.id)}
                            disabled={pendingStepId === step.id}
                            className="text-xs bg-gradient-to-br from-winelio-orange to-winelio-amber text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                          >
                            {pendingStepId === step.id ? "…" : "Valider →"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Annotations de cette étape */}
                    {(isDone || isActive) && (
                      <div className="space-y-2">
                        {anns.map(ann => <AnnotationBubble key={ann.id} ann={ann} />)}
                        {isActive && <AnnotationInput stepId={step.id} />}
                        {isDone && (
                          <AnnotationInput stepId={step.id} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Onglet Infos & Actions ───────────────────────────────────── */}
        {activeTab === "actions" && (
          <div className="p-5 space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Changer le statut
              </h2>
              <div className="flex gap-2 flex-wrap">
                {VALID_STATUSES.map(s => (
                  <form
                    key={s}
                    action={async () => {
                      "use server";
                    }}
                    onSubmit={async e => {
                      e.preventDefault();
                      startTransition(() => onToggleStatus(reco.id, s));
                    }}
                  >
                    <button
                      type="submit"
                      disabled={reco.status === s}
                      className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      → {s}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
```

**Note sur l'onglet Actions** : les boutons de changement de statut utilisent `onSubmit` avec `startTransition` (pas de `<form action>` côté serveur dans un Client Component). Supprimer les `<form>` et les remplacer par des `<button onClick>` wrappés dans `startTransition`.

- [ ] **Step 2 : Corriger le rendu des boutons de statut dans l'onglet Actions**

Remplacer le bloc `{VALID_STATUSES.map(...)}` dans l'onglet "actions" par :

```tsx
{VALID_STATUSES.map(s => (
  <button
    key={s}
    type="button"
    disabled={reco.status === s}
    onClick={() => startTransition(() => onToggleStatus(reco.id, s))}
    className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
  >
    → {s}
  </button>
))}
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "RecoJourneyView" | head -10
```

Résultat attendu : aucune ligne d'erreur.

- [ ] **Step 4 : Commiter**

```bash
git add src/components/admin/RecoJourneyView.tsx
git commit -m "feat(ui): composant RecoJourneyView — timeline annotable avec onglets"
```

---

## Task 4 : Mettre à jour page.tsx

**Files:**
- Modify: `src/app/gestion-reseau/recommandations/[id]/page.tsx`

- [ ] **Step 1 : Remplacer entièrement le contenu du fichier**

```typescript
// src/app/gestion-reseau/recommandations/[id]/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { advanceRecommendationStep, toggleRecommendationStatus } from "../../actions";
import { addRecoAnnotation, deleteRecoAnnotation } from "./actions";
import { RecoJourneyView, type AnnotationRow, type StepRow } from "@/components/admin/RecoJourneyView";

export default async function AdminRecoDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: reco }, { data: annotationsRaw }] = await Promise.all([
    supabaseAdmin
      .from("recommendations")
      .select(`
        id, status, amount, compensation_plan_id,
        referrer:profiles!referrer_id(first_name, last_name, email),
        professional:profiles!professional_id(first_name, last_name, email),
        recommendation_steps(id, completed_at, step:steps(order_index, name))
      `)
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("recommendation_annotations")
      .select("id, recommendation_step_id, content, created_at, author:profiles!author_id(id, first_name, last_name)")
      .eq("recommendation_id", id)
      .order("created_at"),
  ]);

  if (!reco) notFound();

  // Résoudre le commission_rate depuis le plan ou plan par défaut
  let commissionRate: number | null = null;
  if (reco.compensation_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("id", reco.compensation_plan_id)
      .single();
    commissionRate = plan?.commission_rate ?? null;
  }
  if (commissionRate === null) {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    commissionRate = defaultPlan?.commission_rate ?? null;
  }

  const steps = ((reco.recommendation_steps ?? []) as StepRow[]).sort(
    (a, b) => (a.step?.order_index ?? 0) - (b.step?.order_index ?? 0)
  );

  const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
  const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;

  return (
    <RecoJourneyView
      reco={{
        id: reco.id,
        status: reco.status,
        amount: reco.amount,
        commission_rate: commissionRate,
        referrer: referrer ?? null,
        professional: professional ?? null,
      }}
      steps={steps}
      annotations={(annotationsRaw ?? []) as unknown as AnnotationRow[]}
      currentAdminId={user.id}
      onAddAnnotation={addRecoAnnotation}
      onDeleteAnnotation={deleteRecoAnnotation}
      onAdvanceStep={advanceRecommendationStep}
      onToggleStatus={toggleRecommendationStatus}
    />
  );
}
```

- [ ] **Step 2 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "recommandations/\[id\]" | head -10
```

Résultat attendu : aucune erreur.

- [ ] **Step 3 : Lancer le build**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully` (ou `Route (app)` sans erreur rouge).

- [ ] **Step 4 : Tester manuellement sur http://localhost:3002**

Vérifier que la page `/gestion-reseau/recommandations/[id]` :
- Affiche bien les 4 infos en entête
- Affiche la zone "Commentaires généraux" avec champ de saisie
- L'onglet "Parcours" montre la timeline avec étapes colorées
- Le bouton "Valider →" est présent sur l'étape active
- L'onglet "Infos & Actions" montre les boutons de changement de statut
- L'ajout d'une annotation fonctionne (champ → `+` → rechargement)
- La suppression (✕) n'apparaît que sur ses propres annotations

- [ ] **Step 5 : Commiter**

```bash
git add src/app/gestion-reseau/recommandations/[id]/page.tsx
git commit -m "feat(admin): parcours recommandation annoté — refacto page.tsx vers RecoJourneyView"
```

---

## Auto-review

**Spec coverage :**
- ✅ Onglets Parcours / Infos & Actions
- ✅ Zone commentaires généraux (annotations sans step)
- ✅ Timeline : cercles colorés, lignes de connexion, étapes grisées
- ✅ Annotations inline par étape avec couleurs d'auteur
- ✅ Icône ✕ uniquement sur ses propres annotations (`author.id === currentAdminId`)
- ✅ `deleteRecoAnnotation` vérifie `author_id` côté serveur (double garde)
- ✅ Champ annotation sur étapes complétées ET active
- ✅ Commission calculée dans l'entête
- ✅ `assertSuperAdmin()` dans chaque Server Action
- ✅ Contrainte 1000 caractères DB + validation action

**Types :**
- `AnnotationRow` défini et exporté dans `RecoJourneyView.tsx`, importé dans `page.tsx` ✅
- `StepRow` défini et exporté, importé dans `page.tsx` ✅
- `onDeleteAnnotation: (annotationId: string) => Promise<void>` cohérent entre composant et action ✅
