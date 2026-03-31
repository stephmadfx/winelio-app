"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface ProfileNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  sponsor_id: string | null;
  is_professional: boolean;
  is_active: boolean;
}

// ─── Custom Node Card ─────────────────────────────────────────────────────────

type MemberNodeData = {
  label: string;
  initials: string;
  isPro: boolean;
  isActive: boolean;
  childCount: number;
  expanded: boolean;
  userId: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

function MemberNode({ data, id }: NodeProps) {
  const d = data as MemberNodeData;
  const color = !d.isActive ? "#ef4444" : d.isPro ? "#3b82f6" : "#f97316";
  const bgColor = !d.isActive
    ? "rgba(239,68,68,0.12)"
    : d.isPro
    ? "rgba(59,130,246,0.12)"
    : "rgba(249,115,22,0.12)";
  const badge = !d.isActive ? "Suspendu" : d.isPro ? "Pro" : "Particulier";

  return (
    <div
      style={{
        background: "#1e293b",
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 160,
        maxWidth: 180,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.05), 0 4px 16px rgba(0,0,0,0.4)`,
        cursor: "pointer",
        userSelect: "none",
      }}
      onClick={() => d.onSelect(id)}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: color, border: "none" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: bgColor,
            border: `2px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 13,
            color,
            flexShrink: 0,
          }}
        >
          {d.initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#f1f5f9",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 108,
            }}
          >
            {d.label}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 500,
              color,
              background: bgColor,
              borderRadius: 4,
              padding: "1px 6px",
              display: "inline-block",
              marginTop: 2,
            }}
          >
            {badge}
          </div>
        </div>
      </div>

      {d.childCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            d.onToggle(id);
          }}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "4px 0",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            fontSize: 11,
            color: "#94a3b8",
            cursor: "pointer",
          }}
        >
          {d.expanded
            ? `▲ Réduire (${d.childCount})`
            : `▼ ${d.childCount} filleul${d.childCount > 1 ? "s" : ""}`}
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: color, border: "none" }}
      />
    </div>
  );
}

const nodeTypes = { member: MemberNode };

// ─── Profile Panel (portal, positioned above card) ────────────────────────────

function ProfilePanel({
  profile,
  sponsor,
  childCount,
  onClose,
}: {
  profile: ProfileNode;
  sponsor: ProfileNode | null;
  childCount: number;
  onClose: () => void;
}) {
  const name =
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    profile.id.slice(0, 8);
  const initials = name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color = !profile.is_active
    ? "#ef4444"
    : profile.is_professional
    ? "#3b82f6"
    : "#f97316";
  const bgColor = !profile.is_active
    ? "rgba(239,68,68,0.12)"
    : profile.is_professional
    ? "rgba(59,130,246,0.12)"
    : "rgba(249,115,22,0.12)";
  const badge = !profile.is_active
    ? "Suspendu"
    : profile.is_professional
    ? "Professionnel"
    : "Particulier";
  const sponsorName = sponsor
    ? `${sponsor.first_name ?? ""} ${sponsor.last_name ?? ""}`.trim()
    : null;

  return (
    <div
      style={{
        width: 270,
        background: "#0f172a",
        border: `1px solid ${color}50`,
        borderRadius: 16,
        boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: bgColor,
          borderBottom: `1px solid ${color}30`,
          padding: "14px 14px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: bgColor,
            border: `2px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 17,
            color,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "#f1f5f9",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              background: `${color}20`,
              borderRadius: 4,
              padding: "2px 7px",
              display: "inline-block",
              marginTop: 3,
            }}
          >
            {badge}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px 7px",
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Stats */}
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Row
          label="Statut"
          value={profile.is_active ? "Actif" : "Suspendu"}
          valueColor={profile.is_active ? "#34d399" : "#ef4444"}
        />
        <Row
          label="Type"
          value={profile.is_professional ? "Professionnel" : "Particulier"}
        />
        {profile.email && <Row label="Email" value={profile.email} small />}
        <Row label="Filleuls directs" value={String(childCount)} />
        {sponsorName && <Row label="Parrain" value={sponsorName} />}
        <Row label="ID" value={profile.id.slice(0, 13) + "…"} mono />
      </div>

      {/* Action */}
      <div style={{ padding: "0 14px 14px" }}>
        <a
          href={`/gestion-reseau/utilisateurs/${profile.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            background: color,
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            padding: "9px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Voir la fiche complète →
        </a>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
  mono,
  small,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: small ? 10 : 12,
          fontWeight: 600,
          color: valueColor ?? "#cbd5e1",
          fontFamily: mono ? "monospace" : undefined,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Panel positioned above the selected node (inside ReactFlow context) ──────

const NODE_WIDTH = 190;
const PANEL_WIDTH = 270;
const PANEL_MARGIN = 12; // gap between card top and panel bottom

function PanelPortal({
  selectedId,
  profile,
  sponsor,
  childCount,
  onClose,
}: {
  selectedId: string;
  profile: ProfileNode;
  sponsor: ProfileNode | null;
  childCount: number;
  onClose: () => void;
}) {
  const { flowToScreenPosition, getNode } = useReactFlow();
  const node = getNode(selectedId);
  if (!node) return null;

  // Center of the node top edge in screen coords
  const screenPos = flowToScreenPosition({
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y,
  });

  // Clamp so panel doesn't go off left/right of viewport
  const left = Math.max(
    PANEL_WIDTH / 2 + 8,
    Math.min(screenPos.x, window.innerWidth - PANEL_WIDTH / 2 - 8)
  );

  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top: screenPos.y - PANEL_MARGIN,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
        pointerEvents: "auto",
      }}
    >
      <ProfilePanel
        profile={profile}
        sponsor={sponsor}
        childCount={childCount}
        onClose={onClose}
      />
    </div>,
    document.body
  );
}

// ─── Layout algorithm ─────────────────────────────────────────────────────────

const NODE_GAP_X = 30;
const NODE_HEIGHT = 160;

function buildChildrenMap(nodes: ProfileNode[]): Map<string, string[]> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.sponsor_id && nodeMap.has(node.sponsor_id)) {
      if (!childrenMap.has(node.sponsor_id))
        childrenMap.set(node.sponsor_id, []);
      childrenMap.get(node.sponsor_id)!.push(node.id);
    }
  }
  return childrenMap;
}

function calcSubtreeWidth(
  id: string,
  childrenMap: Map<string, string[]>,
  expandedIds: Set<string>
): number {
  const children = expandedIds.has(id) ? (childrenMap.get(id) ?? []) : [];
  if (children.length === 0) return NODE_WIDTH;
  let total = 0;
  for (const childId of children) {
    total += calcSubtreeWidth(childId, childrenMap, expandedIds);
    total += NODE_GAP_X;
  }
  return Math.max(NODE_WIDTH, total - NODE_GAP_X);
}

function placeNode(
  id: string,
  centerX: number,
  y: number,
  childrenMap: Map<string, string[]>,
  expandedIds: Set<string>,
  positions: Map<string, { x: number; y: number }>
): void {
  positions.set(id, { x: centerX - NODE_WIDTH / 2, y });
  if (!expandedIds.has(id)) return;
  const children = childrenMap.get(id) ?? [];
  if (children.length === 0) return;
  const widths = children.map((cid) =>
    calcSubtreeWidth(cid, childrenMap, expandedIds)
  );
  const totalWidth =
    widths.reduce((s, w) => s + w, 0) + NODE_GAP_X * (children.length - 1);
  let currentX = centerX - totalWidth / 2;
  for (let i = 0; i < children.length; i++) {
    placeNode(
      children[i],
      currentX + widths[i] / 2,
      y + NODE_HEIGHT,
      childrenMap,
      expandedIds,
      positions
    );
    currentX += widths[i] + NODE_GAP_X;
  }
}

function layoutTree(
  nodes: ProfileNode[],
  rootIds: string[],
  expandedIds: Set<string>
): {
  flowNodes: Node[];
  flowEdges: Edge[];
  childrenMap: Map<string, string[]>;
} {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = buildChildrenMap(nodes);

  const rootWidths = rootIds.map((id) =>
    calcSubtreeWidth(id, childrenMap, expandedIds)
  );
  const totalWidth =
    rootWidths.reduce((s, w) => s + w, 0) +
    NODE_GAP_X * 3 * (rootIds.length - 1);

  const positions = new Map<string, { x: number; y: number }>();
  let currentX = -totalWidth / 2;
  for (let i = 0; i < rootIds.length; i++) {
    placeNode(
      rootIds[i],
      currentX + rootWidths[i] / 2,
      0,
      childrenMap,
      expandedIds,
      positions
    );
    currentX += rootWidths[i] + NODE_GAP_X * 3;
  }

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  for (const [id, pos] of positions) {
    const profile = nodeMap.get(id);
    if (!profile) continue;
    const children = childrenMap.get(id) ?? [];
    const name =
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      id.slice(0, 8);
    const initials = name
      .split(" ")
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase();

    flowNodes.push({
      id,
      type: "member",
      position: pos,
      data: {
        label: name,
        initials,
        isPro: profile.is_professional,
        isActive: profile.is_active,
        childCount: children.length,
        expanded: expandedIds.has(id),
        userId: id,
        onToggle: () => {},
        onSelect: () => {},
      },
    });

    if (profile.sponsor_id && positions.has(profile.sponsor_id)) {
      flowEdges.push({
        id: `${profile.sponsor_id}-${id}`,
        source: profile.sponsor_id,
        target: id,
        style: { stroke: "#475569", strokeWidth: 1.5 },
        animated: false,
      });
    }
  }

  return { flowNodes, flowEdges, childrenMap };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NetworkTree({
  nodes,
  rootIds,
}: {
  nodes: ProfileNode[];
  rootIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default: aucune expansion — vue propre des racines, zoom confortable
  const defaultExpanded = useMemo(() => new Set<string>(), []);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpanded);

  // Déployer = 3 niveaux à la fois (nœud + enfants + petits-enfants)
  // Replier = nœud seulement (les enfants gardent leur état)
  const handleToggle = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          const cmap = buildChildrenMap(nodes);
          // BFS 3 niveaux depuis ce nœud
          const queue: Array<{ nid: string; depth: number }> = [
            { nid: id, depth: 0 },
          ];
          while (queue.length > 0) {
            const { nid, depth } = queue.shift()!;
            if (depth < 3) {
              next.add(nid);
              for (const childId of cmap.get(nid) ?? []) {
                queue.push({ nid: childId, depth: depth + 1 });
              }
            }
          }
        }
        return next;
      });
    },
    [nodes]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;
    const q = search.toLowerCase();
    const matched = new Set<string>();

    for (const n of nodes) {
      const name = `${n.first_name ?? ""} ${n.last_name ?? ""}`.toLowerCase();
      const email = (n.email ?? "").toLowerCase();
      if (name.includes(q) || email.includes(q)) {
        matched.add(n.id);
        let curr = n;
        while (curr.sponsor_id) {
          const parent = nodeMap.get(curr.sponsor_id);
          if (!parent) break;
          matched.add(parent.id);
          curr = parent;
        }
      }
    }
    return nodes.filter((n) => matched.has(n.id));
  }, [nodes, search, nodeMap]);

  const filteredRootIds = useMemo(() => {
    if (!search.trim()) return rootIds;
    const filteredSet = new Set(filteredNodes.map((n) => n.id));
    return rootIds.filter((id) => filteredSet.has(id));
  }, [search, filteredNodes, rootIds]);

  const activeExpandedIds = useMemo(() => {
    if (!search.trim()) return expandedIds;
    return new Set(filteredNodes.map((n) => n.id));
  }, [search, filteredNodes, expandedIds]);

  const { flowNodes: rawNodes, flowEdges, childrenMap } = useMemo(
    () => layoutTree(filteredNodes, filteredRootIds, activeExpandedIds),
    [filteredNodes, filteredRootIds, activeExpandedIds]
  );

  const flowNodes = useMemo(
    () =>
      rawNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onToggle: handleToggle,
          onSelect: handleSelect,
        },
      })),
    [rawNodes, handleToggle, handleSelect]
  );

  const [, , onNodesChange] = useNodesState(flowNodes);
  const [, , onEdgesChange] = useEdgesState(flowEdges);

  const selectedProfile = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const sponsorProfile = selectedProfile?.sponsor_id
    ? nodeMap.get(selectedProfile.sponsor_id) ?? null
    : null;
  const selectedChildCount = selectedId
    ? (childrenMap.get(selectedId) ?? []).length
    : 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedId(null);
          }}
          placeholder="Rechercher par nom ou email…"
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-80 focus:outline-none focus:border-kiparlo-orange/50"
        />
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
            Particulier
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            Professionnel
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Suspendu
          </span>
        </div>
        <p className="ml-auto text-xs text-gray-500">
          Clic carte → résumé · Bouton ▼ → déplier 3 niveaux
        </p>
      </div>

      {/* Tree */}
      <div
        className="rounded-xl border border-white/5 overflow-hidden"
        style={{ height: "72vh" }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          colorMode="dark"
          minZoom={0.05}
          maxZoom={2}
          // Pan & zoom
          nodesDraggable={false}
          panOnDrag={true}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          preventScrolling={true}
          defaultEdgeOptions={{
            style: { stroke: "#475569", strokeWidth: 1.5 },
          }}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#1e293b"
          />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as MemberNodeData;
              return !d.isActive ? "#ef4444" : d.isPro ? "#3b82f6" : "#f97316";
            }}
            style={{ background: "#0f172a" }}
          />

          {/* Panel portal — uses useReactFlow() so must be inside ReactFlow */}
          {selectedProfile && selectedId && (
            <PanelPortal
              selectedId={selectedId}
              profile={selectedProfile}
              sponsor={sponsorProfile}
              childCount={selectedChildCount}
              onClose={() => setSelectedId(null)}
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
