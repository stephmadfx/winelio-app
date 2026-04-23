# Organigramme Processus de Recommandation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page `/gestion-reseau/processus` dans le dashboard super admin qui affiche l'organigramme complet du processus de recommandation Winelio avec un système de notes par nœud.

**Architecture:** Page Next.js Server Component qui charge les notes depuis Supabase, puis passe les données au composant Client `RecoFlowchart` (React Flow v12). Chaque nœud du flowchart est cliquable et ouvre un Dialog shadcn pour consulter/ajouter des notes persistées dans une nouvelle table `winelio.process_flow_annotations`.

**Tech Stack:** Next.js 15 App Router, @xyflow/react v12, shadcn Dialog, Supabase (schéma `winelio`), TypeScript, Tailwind CSS v4.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260423_process_flow_annotations.sql` | Table `process_flow_annotations` + index + RLS |
| `src/app/gestion-reseau/processus/page.tsx` | Server Component — charge les notes et rend le flowchart |
| `src/app/gestion-reseau/processus/actions.ts` | Server Actions `addFlowAnnotation` + `deleteFlowAnnotation` |
| `src/components/admin/FlowAnnotationDialog.tsx` | Dialog shadcn pour consulter/ajouter une note |
| `src/components/admin/RecoFlowchart.tsx` | Client Component React Flow — nœuds custom + layout |
| `src/components/admin/AdminSidebar.tsx` | +1 entrée de menu "Processus" |

---

## Task 1 : Migration SQL

**Fichiers :**
- Créer : `supabase/migrations/20260423_process_flow_annotations.sql`

- [ ] **Écrire la migration**

```sql
-- supabase/migrations/20260423_process_flow_annotations.sql

CREATE TABLE winelio.process_flow_annotations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    text        NOT NULL,
  content    text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  author_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON winelio.process_flow_annotations (node_id);

ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON winelio.process_flow_annotations
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
```

- [ ] **Appliquer sur le VPS**

```bash
sshpass -p '04660466aA@@@' scp supabase/migrations/20260423_process_flow_annotations.sql root@31.97.152.195:/tmp/
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker cp /tmp/20260423_process_flow_annotations.sql supabase-db-ixlhs1fg5t2n8c4zsgvnys0r:/tmp/ && \
   docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres -f /tmp/20260423_process_flow_annotations.sql"
```

Résultat attendu : `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY`

- [ ] **Vérifier que la table existe**

```bash
sshpass -p '04660466aA@@@' ssh root@31.97.152.195 \
  "docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U supabase_admin -d postgres \
   -c '\dt winelio.process_flow_annotations'"
```

Résultat attendu : une ligne avec `winelio | process_flow_annotations | table`

- [ ] **Committer**

```bash
git add supabase/migrations/20260423_process_flow_annotations.sql
git commit -m "feat(db): table process_flow_annotations pour notes du flowchart"
```

---

## Task 2 : Server Actions

**Fichiers :**
- Créer : `src/app/gestion-reseau/processus/actions.ts`

- [ ] **Créer `actions.ts`**

```typescript
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

export async function addFlowAnnotation(
  nodeId: string,
  content: string
): Promise<void> {
  const user = await assertSuperAdmin();

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 1000) {
    throw new Error("Contenu invalide (1–1000 caractères)");
  }

  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .insert({ node_id: nodeId, content: trimmed, author_id: user.id });

  if (error) throw new Error(`Erreur ajout note : ${error.message}`);
  revalidatePath("/gestion-reseau/processus");
}

export async function deleteFlowAnnotation(annotationId: string): Promise<void> {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) throw new Error(`Erreur suppression note : ${error.message}`);
  revalidatePath("/gestion-reseau/processus");
}
```

- [ ] **Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Résultat attendu : aucune erreur

- [ ] **Committer**

```bash
git add src/app/gestion-reseau/processus/actions.ts
git commit -m "feat(admin): server actions addFlowAnnotation + deleteFlowAnnotation"
```

---

## Task 3 : FlowAnnotationDialog

**Fichiers :**
- Créer : `src/components/admin/FlowAnnotationDialog.tsx`

- [ ] **Créer le composant Dialog**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addFlowAnnotation, deleteFlowAnnotation } from "@/app/gestion-reseau/processus/actions";

export type FlowAnnotation = {
  id: string;
  node_id: string;
  content: string;
  created_at: string;
  author: { first_name: string | null; last_name: string | null } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeLabel: string;
  annotations: FlowAnnotation[];
};

export function FlowAnnotationDialog({ open, onClose, nodeId, nodeLabel, annotations }: Props) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!text.trim()) return;
    startTransition(async () => {
      await addFlowAnnotation(nodeId, text.trim());
      setText("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteFlowAnnotation(id);
    });
  }

  const nodeAnnotations = annotations.filter((a) => a.node_id === nodeId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* En-tête orange */}
        <div className="bg-gradient-to-r from-[#FF6B35] to-[#F7931E] px-5 py-4">
          <DialogHeader>
            <DialogTitle className="text-white text-[15px] font-bold">
              Note — {nodeLabel}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Info nœud */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex gap-2 items-center">
            <span>🔵</span>
            <span>Nœud : <strong className="text-gray-700">{nodeLabel}</strong></span>
          </div>

          {/* Notes existantes */}
          {nodeAnnotations.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                Notes existantes ({nodeAnnotations.length})
              </p>
              <div className="space-y-2">
                {nodeAnnotations.map((ann) => {
                  const authorName = [ann.author?.first_name, ann.author?.last_name]
                    .filter(Boolean).join(" ") || "Administrateur";
                  const date = new Date(ann.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "short", year: "numeric",
                  });
                  return (
                    <div key={ann.id} className="bg-[#FFFBF0] border-l-[3px] border-[#F7931E] rounded-r-lg px-3 py-2">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-[11px] text-gray-400">{authorName} · {date}</p>
                        <button
                          onClick={() => handleDelete(ann.id)}
                          disabled={isPending}
                          className="text-gray-300 hover:text-red-400 text-xs leading-none"
                          title="Supprimer cette note"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[13px] text-gray-700 mt-1">{ann.content}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ajout d'une note */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Ajouter une note
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre note sur cette étape…"
              rows={3}
              maxLength={1000}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 resize-none outline-none focus:border-[#FF6B35] transition-colors"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-500 font-semibold text-[13px] px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !text.trim()}
            className="bg-gradient-to-br from-[#FF6B35] to-[#F7931E] text-white font-semibold text-[13px] px-4 py-2 rounded-lg disabled:opacity-50 transition-opacity"
          >
            {isPending ? "…" : "Enregistrer"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Résultat attendu : aucune erreur

- [ ] **Committer**

```bash
git add src/components/admin/FlowAnnotationDialog.tsx
git commit -m "feat(admin): FlowAnnotationDialog — popup notes sur nœuds flowchart"
```

---

## Task 4 : RecoFlowchart — nœuds custom React Flow

**Fichiers :**
- Créer : `src/components/admin/RecoFlowchart.tsx` (version initiale avec les types de nœuds seulement)

- [ ] **Créer `RecoFlowchart.tsx` avec les types de nœuds**

```typescript
"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type NodeProps,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlowAnnotationDialog, type FlowAnnotation } from "./FlowAnnotationDialog";

// ── Types ──────────────────────────────────────────────────────────────────

type NodeData = {
  label: string;
  sublabel?: string;
  hasAnnotations: boolean;
  onNodeClick: (nodeId: string, label: string) => void;
};

// ── Badge annotations ──────────────────────────────────────────────────────

function AnnotationBadge() {
  return (
    <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#FF6B35] rounded-full text-white text-[10px] flex items-center justify-center shadow-sm z-10">
      💬
    </span>
  );
}

// ── Nœud : Départ / Fin ───────────────────────────────────────────────────

function StartEndNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  const isEnd = id === "fin";
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        className="px-6 py-2 rounded-full font-bold text-white text-[13px] text-center min-w-[300px] shadow-md"
        style={{ background: isEnd ? "#27AE60" : "linear-gradient(135deg, #FF6B35, #F7931E)" }}
      >
        {d.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Action (étape standard) ────────────────────────────────────────

function ActionNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="bg-white border-2 border-[#2D3436] rounded-lg px-4 py-2 min-w-[300px] shadow-sm text-center">
        <p className="text-[12px] font-bold text-[#2D3436]">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Action orange (étape 5 — devis) ────────────────────────────────

function ActionOrangeNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="bg-white border-2 border-[#FF6B35] rounded-lg px-4 py-2 min-w-[300px] shadow-sm text-center">
        <p className="text-[12px] font-bold text-[#FF6B35]">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Email ──────────────────────────────────────────────────────────

function EmailNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        className="rounded-lg px-4 py-2 min-w-[260px] shadow-sm text-center"
        style={{ background: "#F7931E" }}
      >
        <p className="text-[11px] font-bold text-white">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-white/80 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Suivi automatique (tracking) ───────────────────────────────────

function TrackingNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        className="rounded-lg px-4 py-2 min-w-[260px] text-center"
        style={{
          background: "#EBF5FB",
          border: "1.5px dashed #2980B9",
        }}
      >
        <p className="text-[11px] font-semibold text-[#2980B9]">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Décision (losange) ─────────────────────────────────────────────

function DecisionNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  const isOrange = id === "devis";
  const borderColor = isOrange ? "#FF6B35" : "#2980B9";
  const textColor = isOrange ? "#FF6B35" : "#2D3436";
  return (
    <div
      className="relative cursor-pointer select-none flex items-center justify-center"
      style={{ width: 160, height: 160 }}
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} style={{ top: 0 }} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} style={{ bottom: 0 }} className="!opacity-0" />
      <Handle type="source" position={Position.Left} style={{ left: 0 }} id="left" className="!opacity-0" />
      <Handle type="source" position={Position.Right} style={{ right: 0 }} id="right" className="!opacity-0" />
      {/* Losange via rotation CSS */}
      <div
        className="absolute inset-4 shadow-sm"
        style={{
          background: "white",
          border: `2px solid ${borderColor}`,
          transform: "rotate(45deg)",
          borderRadius: 6,
        }}
      />
      {/* Texte contre-rotaté */}
      <div className="relative z-10 text-center px-2">
        <p className="text-[11px] font-bold leading-tight" style={{ color: textColor }}>
          {d.label}
        </p>
      </div>
    </div>
  );
}

// ── Nœud : Commissions MLM ────────────────────────────────────────────────

function CommissionsNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="bg-[#2D3436] rounded-lg px-4 py-2 min-w-[420px] shadow-md text-center">
        <p className="text-[11px] font-bold text-white">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-white/60 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Fin négative ───────────────────────────────────────────────────

function NegativeNode({ data, id }: NodeProps) {
  const d = data as NodeData;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="bg-[#FDECEA] border-2 border-[#E74C3C] rounded-lg px-4 py-2 min-w-[130px] text-center">
        <p className="text-[12px] font-bold text-[#C0392B]">{d.label}</p>
      </div>
    </div>
  );
}

// ── nodeTypes ─────────────────────────────────────────────────────────────

const nodeTypes = {
  "start-end": StartEndNode,
  action: ActionNode,
  "action-orange": ActionOrangeNode,
  email: EmailNode,
  tracking: TrackingNode,
  decision: DecisionNode,
  commissions: CommissionsNode,
  negative: NegativeNode,
};

// ── Placeholder export (complété à la Task 5) ────────────────────────────

export type { FlowAnnotation };

export function RecoFlowchart(_props: { annotations: FlowAnnotation[] }) {
  return <div className="h-96 flex items-center justify-center text-gray-400">À compléter — Task 5</div>;
}
```

- [ ] **Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Résultat attendu : aucune erreur

- [ ] **Committer**

```bash
git add src/components/admin/RecoFlowchart.tsx
git commit -m "feat(admin): nœuds custom React Flow pour le flowchart reco"
```

---

## Task 5 : RecoFlowchart — nœuds, edges et composant final

**Fichiers :**
- Modifier : `src/components/admin/RecoFlowchart.tsx` (remplacer le placeholder)

- [ ] **Remplacer le placeholder export par le composant complet**

Remplacer les deux dernières lignes du fichier (à partir de `// ── Placeholder export`) par :

```typescript
// ── Données du flowchart (statiques) ─────────────────────────────────────

const FLOW_NODES_DEF = [
  // Départ / fin
  { id: "depart",          type: "start-end",      label: "✨ Le recommandeur crée une recommandation" },
  { id: "fin",             type: "start-end",      label: "✅ Étape 8 — Affaire terminée" },
  // Décisions
  { id: "pro-inscrit",     type: "decision",       label: "Professionnel déjà inscrit ?" },
  { id: "acceptation",     type: "decision",       label: "Le professionnel accepte ?" },
  { id: "devis",           type: "decision",       label: "Le recommandeur valide le devis ?" },
  // Emails
  { id: "email-inscrit",   type: "email",          label: "📧 Email \"Nouvelle recommandation\"",        sublabel: "Bouton \"Voir la recommandation\"" },
  { id: "email-non-inscrit",type:"email",          label: "📧 Email \"Un client vous recommande\"",      sublabel: "Bouton \"Revendiquer ma fiche\"" },
  { id: "email-commission",type: "email",          label: "📧 Email \"Commission à régler\" → Pro",      sublabel: "J+0 · Relance J+2 · Alerte J+4" },
  // Suivi automatique
  { id: "ouverture-inscrit",   type: "tracking",   label: "👁 Email ouvert",                             sublabel: "email_opened_at enregistré (1ère fois)" },
  { id: "ouverture-non-inscrit",type:"tracking",   label: "👁 Email ouvert",                             sublabel: "email_opened_at enregistré (1ère fois)" },
  { id: "clic-inscrit",        type: "tracking",   label: "👆 Bouton cliqué dans l'email",               sublabel: "email_clicked_at · redirection vers la reco" },
  { id: "clic-non-inscrit",    type: "tracking",   label: "👆 Bouton cliqué dans l'email",               sublabel: "email_clicked_at · déclenche la revendication" },
  // Actions
  { id: "revendication",   type: "action",         label: "🔗 Revendication de fiche",                   sublabel: "Le professionnel s'inscrit et valide sa fiche" },
  { id: "etape-2",         type: "action",         label: "Étape 2 — Recommandation acceptée",           sublabel: "Identité du professionnel dévoilée au recommandeur" },
  { id: "etape-3",         type: "action",         label: "Étape 3 — Contact établi",                    sublabel: "Le professionnel contacte le client" },
  { id: "etape-4",         type: "action",         label: "Étape 4 — Rendez-vous fixé",                  sublabel: "Le professionnel fixe un rendez-vous avec le client" },
  { id: "etape-5",         type: "action-orange",  label: "Étape 5 — Devis soumis",                      sublabel: "Le professionnel renseigne le montant du devis" },
  { id: "etape-7",         type: "action",         label: "Étape 7 — Paiement de la commission confirmé" },
  // Commissions
  { id: "commissions",     type: "commissions",    label: "💰 Commissions créées automatiquement — 5 niveaux", sublabel: "Recommandeur 60% · Niveaux 1→5 : 4% · Professionnel 1% Gains · Winelio 14%" },
  // Négatifs
  { id: "rejetee",         type: "negative",       label: "❌ Rejetée" },
  { id: "annulee",         type: "negative",       label: "⏸ Annulée" },
] as const;

// Positions (layout top-down, branches gauche/droite)
const POSITIONS: Record<string, { x: number; y: number }> = {
  "depart":               { x: 300, y: 0 },
  "pro-inscrit":          { x: 320, y: 80 },
  "email-inscrit":        { x: 0,   y: 220 },
  "email-non-inscrit":    { x: 680, y: 220 },
  "ouverture-inscrit":    { x: 0,   y: 340 },
  "ouverture-non-inscrit":{ x: 680, y: 340 },
  "clic-inscrit":         { x: 0,   y: 456 },
  "revendication":        { x: 680, y: 456 },
  "clic-non-inscrit":     { x: 680, y: 580 },
  "acceptation":          { x: 320, y: 580 },
  "rejetee":              { x: 860, y: 592 },
  "etape-2":              { x: 300, y: 720 },
  "etape-3":              { x: 300, y: 840 },
  "etape-4":              { x: 300, y: 960 },
  "etape-5":              { x: 300, y: 1080 },
  "devis":                { x: 320, y: 1200 },
  "annulee":              { x: 860, y: 1212 },
  "commissions":          { x: 190, y: 1340 },
  "email-commission":     { x: 220, y: 1460 },
  "etape-7":              { x: 300, y: 1580 },
  "fin":                  { x: 300, y: 1700 },
};

const EDGES: Edge[] = [
  { id: "e-depart-pro",           source: "depart",             target: "pro-inscrit",        type: "smoothstep" },
  { id: "e-pro-email-inscrit",    source: "pro-inscrit",        target: "email-inscrit",      type: "smoothstep", label: "✅ Déjà inscrit",  style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-pro-email-non",        source: "pro-inscrit",        target: "email-non-inscrit",  type: "smoothstep", label: "❌ Non inscrit",   style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 } },
  { id: "e-email-i-ouv-i",        source: "email-inscrit",      target: "ouverture-inscrit",  type: "smoothstep" },
  { id: "e-email-ni-ouv-ni",      source: "email-non-inscrit",  target: "ouverture-non-inscrit", type: "smoothstep" },
  { id: "e-ouv-i-clic-i",         source: "ouverture-inscrit",  target: "clic-inscrit",       type: "smoothstep" },
  { id: "e-ouv-ni-rev",           source: "ouverture-non-inscrit", target: "revendication",   type: "smoothstep" },
  { id: "e-rev-clic-ni",          source: "revendication",      target: "clic-non-inscrit",   type: "smoothstep" },
  { id: "e-clic-i-accept",        source: "clic-inscrit",       target: "acceptation",        type: "smoothstep" },
  { id: "e-clic-ni-accept",       source: "clic-non-inscrit",   target: "acceptation",        type: "smoothstep" },
  { id: "e-accept-etape2",        source: "acceptation",        target: "etape-2",            type: "smoothstep", label: "✅ OUI", style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-accept-rejetee",       source: "acceptation",        target: "rejetee",            type: "smoothstep", label: "❌ NON", style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 }, sourceHandle: "right" },
  { id: "e-etape2-etape3",        source: "etape-2",            target: "etape-3",            type: "smoothstep" },
  { id: "e-etape3-etape4",        source: "etape-3",            target: "etape-4",            type: "smoothstep" },
  { id: "e-etape4-etape5",        source: "etape-4",            target: "etape-5",            type: "smoothstep" },
  { id: "e-etape5-devis",         source: "etape-5",            target: "devis",              type: "smoothstep" },
  { id: "e-devis-commissions",    source: "devis",              target: "commissions",        type: "smoothstep", label: "✅ OUI", style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-devis-annulee",        source: "devis",              target: "annulee",            type: "smoothstep", label: "❌ NON", style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 }, sourceHandle: "right" },
  { id: "e-commissions-email",    source: "commissions",        target: "email-commission",   type: "smoothstep" },
  { id: "e-email-etape7",         source: "email-commission",   target: "etape-7",            type: "smoothstep" },
  { id: "e-etape7-fin",           source: "etape-7",            target: "fin",                type: "smoothstep" },
];

// ── Légende ───────────────────────────────────────────────────────────────

const LEGEND = [
  { color: "#FF6B35", label: "Départ / Fin", rounded: true },
  { color: "#fff", border: "#2D3436", label: "Étape / Action" },
  { color: "#F7931E", label: "Email automatique" },
  { color: "#EBF5FB", border: "#2980B9", dashed: true, label: "Suivi automatique" },
  { color: "#EBF5FB", border: "#2980B9", label: "Décision" },
  { color: "#2D3436", label: "Commissions" },
  { color: "#FDECEA", border: "#E74C3C", label: "Fin négative" },
];

// ── Composant principal ───────────────────────────────────────────────────

export type { FlowAnnotation };

export function RecoFlowchart({ annotations }: { annotations: FlowAnnotation[] }) {
  const [dialog, setDialog] = useState<{ nodeId: string; label: string } | null>(null);

  const handleNodeClick = useCallback((nodeId: string, label: string) => {
    setDialog({ nodeId, label });
  }, []);

  const annotatedNodeIds = new Set(annotations.map((a) => a.node_id));

  const nodes: Node[] = FLOW_NODES_DEF.map((def) => ({
    id: def.id,
    type: def.type,
    position: POSITIONS[def.id],
    data: {
      label: def.label,
      sublabel: "sublabel" in def ? def.sublabel : undefined,
      hasAnnotations: annotatedNodeIds.has(def.id),
      onNodeClick: handleNodeClick,
    },
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Flowchart */}
      <div style={{ height: "calc(100vh - 200px)", minHeight: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={EDGES}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="#E5E7EB" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-4 px-6 py-3 border-t border-gray-100 bg-white">
        {LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
              style={{
                background: item.color,
                border: item.border ? `2px ${item.dashed ? "dashed" : "solid"} ${item.border}` : undefined,
                borderRadius: item.rounded ? "50%" : undefined,
              }}
            />
            {item.label}
          </div>
        ))}
        <div className="ml-auto">
          <span className="text-xs bg-[#FFF5F0] border border-[#FF6B35] text-[#FF6B35] font-bold rounded-full px-2 py-0.5">
            💬 = note administrateur
          </span>
        </div>
      </div>

      {/* Dialog annotations */}
      {dialog && (
        <FlowAnnotationDialog
          open
          onClose={() => setDialog(null)}
          nodeId={dialog.nodeId}
          nodeLabel={dialog.label}
          annotations={annotations}
        />
      )}
    </div>
  );
}
```

- [ ] **Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Résultat attendu : aucune erreur

- [ ] **Committer**

```bash
git add src/components/admin/RecoFlowchart.tsx
git commit -m "feat(admin): RecoFlowchart complet — nœuds, edges, légende, dialog annotations"
```

---

## Task 6 : Page serveur

**Fichiers :**
- Créer : `src/app/gestion-reseau/processus/page.tsx`

- [ ] **Créer la page**

```typescript
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RecoFlowchart, type FlowAnnotation } from "@/components/admin/RecoFlowchart";

export const metadata = { title: "Processus de recommandation — Admin" };

export default async function ProcessusPage() {
  const { data } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .select("id, node_id, content, created_at, author:profiles!author_id(first_name, last_name)")
    .order("created_at", { ascending: false });

  const annotations = (data ?? []) as unknown as FlowAnnotation[];

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-[#2D3436]">
              Organigramme du processus de{" "}
              <span className="text-[#FF6B35]">recommandation</span>
            </h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Vue d&apos;ensemble · 8 étapes · Générique — Cliquez sur un nœud pour ajouter une note
            </p>
          </div>
          <span className="text-[11px] bg-[#FFF5F0] border border-[#FF6B35] text-[#FF6B35] font-bold rounded-full px-3 py-1">
            🔐 Super administrateur
          </span>
        </div>
      </div>

      {/* Flowchart */}
      <div className="flex-1 bg-[#FAFBFC]">
        <RecoFlowchart annotations={annotations} />
      </div>
    </div>
  );
}
```

- [ ] **Vérifier TypeScript + build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -20
```

Résultat attendu : aucune erreur TypeScript, build réussi

- [ ] **Committer**

```bash
git add src/app/gestion-reseau/processus/page.tsx
git commit -m "feat(admin): page /gestion-reseau/processus — organigramme processus reco"
```

---

## Task 7 : Entrée de menu AdminSidebar

**Fichiers :**
- Modifier : `src/components/admin/AdminSidebar.tsx`

- [ ] **Ajouter l'entrée "Processus" dans `navItems`**

Dans `AdminSidebar.tsx`, ajouter après l'entrée `Réseau MLM` :

```typescript
  {
    label: "Processus",
    href: "/gestion-reseau/processus",
    // Icône : organigramme / diagramme de flux (GitBranch-like)
    icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2h2a2 2 0 012 2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v6m-4 4h4m0 0a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2",
  },
```

- [ ] **Build final**

```bash
npm run build 2>&1 | tail -20
```

Résultat attendu : `✓ Compiled successfully`

- [ ] **Redémarrer PM2 et vérifier dans le navigateur**

```bash
pm2 restart winelio
```

Ouvrir `http://localhost:3002/gestion-reseau/processus` :
- ✅ La page se charge
- ✅ L'icône "Processus" est visible dans la sidebar
- ✅ Le flowchart s'affiche avec tous les nœuds
- ✅ Cliquer sur un nœud → Dialog s'ouvre
- ✅ Ajouter une note → elle apparaît dans le Dialog
- ✅ Supprimer une note → elle disparaît
- ✅ Le badge 💬 apparaît sur les nœuds annotés après rechargement

- [ ] **Committer**

```bash
git add src/components/admin/AdminSidebar.tsx
git commit -m "feat(admin): entrée de menu Processus dans la sidebar admin"
```

---

## Self-review checklist (validée)

| Exigence spec | Tâche |
|---|---|
| Route `/gestion-reseau/processus` | Task 6 |
| Accès super admin garanti | Task 2 (assertSuperAdmin) + layout existant |
| Entrée de menu AdminSidebar | Task 7 |
| Table `process_flow_annotations` | Task 1 |
| 21 nœuds définis avec node_id | Task 5 |
| 9 types de nœuds visuels | Task 4 |
| Badge 💬 sur les nœuds annotés | Task 4 (AnnotationBadge) |
| Dialog au clic sur un nœud | Task 3 + Task 5 |
| Ajout d'une note | Task 2 + Task 3 |
| Suppression d'une note | Task 2 + Task 3 |
| Chargement serveur des notes | Task 6 |
| Légende visuelle | Task 5 |
| Zoom/pan React Flow | Task 5 (fitView, minZoom, maxZoom) |
| Flowchart statique (non éditable) | Task 5 (nodesDraggable: false) |
