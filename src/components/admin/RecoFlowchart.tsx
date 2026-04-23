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

function StartEndNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

function ActionNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

function ActionOrangeNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

function EmailNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

function TrackingNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
  return (
    <div
      className="relative cursor-pointer select-none"
      onClick={() => d.onNodeClick(id, d.label)}
    >
      {d.hasAnnotations && <AnnotationBadge />}
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        className="rounded-lg px-4 py-2 min-w-[260px] text-center"
        style={{ background: "#EBF5FB", border: "1.5px dashed #2980B9" }}
      >
        <p className="text-[11px] font-semibold text-[#2980B9]">{d.label}</p>
        {d.sublabel && <p className="text-[10px] text-gray-400 mt-0.5">{d.sublabel}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

// ── Nœud : Décision (losange) ─────────────────────────────────────────────

function DecisionNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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
      <div
        className="absolute inset-4 shadow-sm"
        style={{ background: "white", border: `2px solid ${borderColor}`, transform: "rotate(45deg)", borderRadius: 6 }}
      />
      <div className="relative z-10 text-center px-2">
        <p className="text-[11px] font-bold leading-tight" style={{ color: textColor }}>
          {d.label}
        </p>
      </div>
    </div>
  );
}

// ── Nœud : Commissions MLM ────────────────────────────────────────────────

function CommissionsNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

function NegativeNode(props: NodeProps) {
  const d = props.data as NodeData;
  const id = props.id;
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

// ── Données du flowchart (statiques) ─────────────────────────────────────

const FLOW_NODES_DEF = [
  { id: "depart",               type: "start-end",     label: "✨ Le recommandeur crée une recommandation" },
  { id: "fin",                  type: "start-end",     label: "✅ Étape 8 — Affaire terminée" },
  { id: "pro-inscrit",          type: "decision",      label: "Professionnel déjà inscrit ?" },
  { id: "acceptation",          type: "decision",      label: "Le professionnel accepte ?" },
  { id: "devis",                type: "decision",      label: "Le recommandeur valide le devis ?" },
  { id: "email-inscrit",        type: "email",         label: "📧 Email \"Nouvelle recommandation\"",       sublabel: "Bouton \"Voir la recommandation\"" },
  { id: "email-non-inscrit",    type: "email",         label: "📧 Email \"Un client vous recommande\"",     sublabel: "Bouton \"Revendiquer ma fiche\"" },
  { id: "email-commission",     type: "email",         label: "📧 Email \"Commission à régler\" → Pro",     sublabel: "J+0 · Relance J+2 · Alerte J+4" },
  { id: "ouverture-inscrit",    type: "tracking",      label: "👁 Email ouvert",                            sublabel: "email_opened_at enregistré (1ère fois)" },
  { id: "ouverture-non-inscrit",type: "tracking",      label: "👁 Email ouvert",                            sublabel: "email_opened_at enregistré (1ère fois)" },
  { id: "clic-inscrit",         type: "tracking",      label: "👆 Bouton cliqué dans l'email",              sublabel: "email_clicked_at · redirection vers la reco" },
  { id: "clic-non-inscrit",     type: "tracking",      label: "👆 Bouton cliqué dans l'email",              sublabel: "email_clicked_at · déclenche la revendication" },
  { id: "revendication",        type: "action",        label: "🔗 Revendication de fiche",                  sublabel: "Le professionnel s'inscrit et valide sa fiche" },
  { id: "etape-2",              type: "action",        label: "Étape 2 — Recommandation acceptée",          sublabel: "Identité du professionnel dévoilée au recommandeur" },
  { id: "etape-3",              type: "action",        label: "Étape 3 — Contact établi",                   sublabel: "Le professionnel contacte le client" },
  { id: "etape-4",              type: "action",        label: "Étape 4 — Rendez-vous fixé",                 sublabel: "Le professionnel fixe un rendez-vous avec le client" },
  { id: "etape-5",              type: "action-orange", label: "Étape 5 — Devis soumis",                     sublabel: "Le professionnel renseigne le montant du devis" },
  { id: "etape-7",              type: "action",        label: "Étape 7 — Paiement de la commission confirmé" },
  { id: "commissions",          type: "commissions",   label: "💰 Commissions créées automatiquement — 5 niveaux", sublabel: "Recommandeur 60% · Niveaux 1→5 : 4% · Professionnel 1% Gains · Winelio 14%" },
  { id: "rejetee",              type: "negative",      label: "❌ Rejetée" },
  { id: "annulee",              type: "negative",      label: "⏸ Annulée" },
] as const;

const POSITIONS: Record<string, { x: number; y: number }> = {
  "depart":                { x: 300, y: 0 },
  "pro-inscrit":           { x: 320, y: 80 },
  "email-inscrit":         { x: 0,   y: 220 },
  "email-non-inscrit":     { x: 680, y: 220 },
  "ouverture-inscrit":     { x: 0,   y: 340 },
  "ouverture-non-inscrit": { x: 680, y: 340 },
  "clic-inscrit":          { x: 0,   y: 456 },
  "revendication":         { x: 680, y: 456 },
  "clic-non-inscrit":      { x: 680, y: 580 },
  "acceptation":           { x: 320, y: 580 },
  "rejetee":               { x: 860, y: 592 },
  "etape-2":               { x: 300, y: 720 },
  "etape-3":               { x: 300, y: 840 },
  "etape-4":               { x: 300, y: 960 },
  "etape-5":               { x: 300, y: 1080 },
  "devis":                 { x: 320, y: 1200 },
  "annulee":               { x: 860, y: 1212 },
  "commissions":           { x: 190, y: 1340 },
  "email-commission":      { x: 220, y: 1460 },
  "etape-7":               { x: 300, y: 1580 },
  "fin":                   { x: 300, y: 1700 },
};

const EDGES: Edge[] = [
  { id: "e-depart-pro",        source: "depart",              target: "pro-inscrit",         type: "smoothstep" },
  { id: "e-pro-email-inscrit", source: "pro-inscrit",         target: "email-inscrit",       type: "smoothstep", label: "✅ Déjà inscrit", style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-pro-email-non",     source: "pro-inscrit",         target: "email-non-inscrit",   type: "smoothstep", label: "❌ Non inscrit",  style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 } },
  { id: "e-email-i-ouv-i",     source: "email-inscrit",       target: "ouverture-inscrit",   type: "smoothstep" },
  { id: "e-email-ni-ouv-ni",   source: "email-non-inscrit",   target: "ouverture-non-inscrit", type: "smoothstep" },
  { id: "e-ouv-i-clic-i",      source: "ouverture-inscrit",   target: "clic-inscrit",        type: "smoothstep" },
  { id: "e-ouv-ni-rev",        source: "ouverture-non-inscrit", target: "revendication",     type: "smoothstep" },
  { id: "e-rev-clic-ni",       source: "revendication",       target: "clic-non-inscrit",    type: "smoothstep" },
  { id: "e-clic-i-accept",     source: "clic-inscrit",        target: "acceptation",         type: "smoothstep" },
  { id: "e-clic-ni-accept",    source: "clic-non-inscrit",    target: "acceptation",         type: "smoothstep" },
  { id: "e-accept-etape2",     source: "acceptation",         target: "etape-2",             type: "smoothstep", label: "✅ OUI", style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-accept-rejetee",    source: "acceptation",         target: "rejetee",             type: "smoothstep", label: "❌ NON", style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 }, sourceHandle: "right" },
  { id: "e-etape2-etape3",     source: "etape-2",             target: "etape-3",             type: "smoothstep" },
  { id: "e-etape3-etape4",     source: "etape-3",             target: "etape-4",             type: "smoothstep" },
  { id: "e-etape4-etape5",     source: "etape-4",             target: "etape-5",             type: "smoothstep" },
  { id: "e-etape5-devis",      source: "etape-5",             target: "devis",               type: "smoothstep" },
  { id: "e-devis-commissions", source: "devis",               target: "commissions",         type: "smoothstep", label: "✅ OUI", style: { stroke: "#27AE60" }, labelStyle: { fill: "#27AE60", fontWeight: 700, fontSize: 11 } },
  { id: "e-devis-annulee",     source: "devis",               target: "annulee",             type: "smoothstep", label: "❌ NON", style: { stroke: "#E74C3C" }, labelStyle: { fill: "#E74C3C", fontWeight: 700, fontSize: 11 }, sourceHandle: "right" },
  { id: "e-commissions-email", source: "commissions",         target: "email-commission",    type: "smoothstep" },
  { id: "e-email-etape7",      source: "email-commission",    target: "etape-7",             type: "smoothstep" },
  { id: "e-etape7-fin",        source: "etape-7",             target: "fin",                 type: "smoothstep" },
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
