"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
interface GraphNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  city: string | null;
  is_professional: boolean;
  is_demo: boolean;
  company_alias: string | null;
  company_category: string | null;
  level: number;
  children: GraphNode[];
  childCount: number;
  loaded: boolean;
  expanded: boolean;
  activeRecos: number;
  completedRecos: number;
}

interface NodeEvent {
  id: string;
  status: string;
  step_order: number;
  step_label: string;
  amount: number | null;
  created_at: string;
  role: "referrer" | "professional";
  contact_name: string | null;
  professional_name: string | null;
  professional_category: string | null;
  referrer_name: string | null;
}

const LEVEL_COLORS = [
  "#FF6B35", "#F7931E", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA",
];

export function NetworkGraph({ userId, userName, userAvatar, rootLabel, maxLevel = 5 }: { userId: string; userName: string; userAvatar?: string | null; rootLabel?: string; maxLevel?: number }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, tx: 0, ty: 0, scale: 1 });

  const [tree, setTree] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [events, setEvents] = useState<NodeEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [, rerender] = useState(0);

  // ── Pan & zoom ─────────────────────────────────────
  const applyTransform = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const { tx, ty, scale } = dragState.current;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const THRESHOLD = 5;
    let moved = false;
    let mouseStartX = 0, mouseStartY = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      // Start tracking from anywhere inside the viewport
      moved = false;
      mouseStartX = e.clientX;
      mouseStartY = e.clientY;
      dragState.current.startX = e.clientX - dragState.current.tx;
      dragState.current.startY = e.clientY - dragState.current.ty;
      dragState.current.dragging = true;
      e.preventDefault(); // Prevent text selection
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - mouseStartX;
      const dy = e.clientY - mouseStartY;
      if (!moved && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      moved = true;
      vp!.style.cursor = "grabbing";
      dragState.current.tx = e.clientX - dragState.current.startX;
      dragState.current.ty = e.clientY - dragState.current.startY;
      applyTransform();
    }

    function onMouseUp() {
      if (!dragState.current.dragging) return;
      dragState.current.dragging = false;
      vp!.style.cursor = "grab";
      if (moved) {
        vp!.dataset.wasDrag = "true";
        setTimeout(() => { delete vp!.dataset.wasDrag; }, 50);
      }
    }

    // Touch support
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        // Pinch start
        dragState.current.dragging = false;
        pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartScale = dragState.current.scale;
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;
      moved = false;
      mouseStartX = e.touches[0].clientX;
      mouseStartY = e.touches[0].clientY;
      dragState.current.startX = e.touches[0].clientX - dragState.current.tx;
      dragState.current.startY = e.touches[0].clientY - dragState.current.ty;
      dragState.current.dragging = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        // Pinch zoom
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const newScale = Math.min(Math.max(pinchStartScale * (dist / pinchStartDist), 0.2), 4);
        const oldScale = dragState.current.scale;
        const rect = vp!.getBoundingClientRect();
        // Zoom toward midpoint of the two fingers
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const ratio = newScale / oldScale;
        dragState.current.tx = midX - ratio * (midX - dragState.current.tx);
        dragState.current.ty = midY - ratio * (midY - dragState.current.ty);
        dragState.current.scale = newScale;
        applyTransform();
        rerender(n => n + 1);
        e.preventDefault();
        return;
      }
      if (!dragState.current.dragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - mouseStartX;
      const dy = e.touches[0].clientY - mouseStartY;
      if (!moved && Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      moved = true;
      e.preventDefault();
      dragState.current.tx = e.touches[0].clientX - dragState.current.startX;
      dragState.current.ty = e.touches[0].clientY - dragState.current.startY;
      applyTransform();
    }

    function onTouchEnd() {
      dragState.current.dragging = false;
      if (moved) {
        vp!.dataset.wasDrag = "true";
        setTimeout(() => { delete vp!.dataset.wasDrag; }, 50);
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const oldScale = dragState.current.scale;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.min(Math.max(oldScale + delta, 0.2), 4);

      // Zoom toward mouse position
      const rect = vp!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Adjust translation so the point under the cursor stays fixed
      const ratio = newScale / oldScale;
      dragState.current.tx = mouseX - ratio * (mouseX - dragState.current.tx);
      dragState.current.ty = mouseY - ratio * (mouseY - dragState.current.ty);
      dragState.current.scale = newScale;

      applyTransform();
      rerender(n => n + 1);
    }

    // Mouse: down on viewport, move/up on window (so drag continues outside)
    vp.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    // Touch
    vp.addEventListener("touchstart", onTouchStart, { passive: false });
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    vp.addEventListener("touchend", onTouchEnd);
    // Wheel
    vp.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      vp.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      vp.removeEventListener("touchstart", onTouchStart);
      vp.removeEventListener("touchmove", onTouchMove);
      vp.removeEventListener("touchend", onTouchEnd);
      vp.removeEventListener("wheel", onWheel);
    };
  }, [applyTransform]);

  // ── Store raw API tree and build GraphNodes lazily ─
  const rawTreeRef = useRef<any>(null);

  function materializeNode(apiNode: any, level: number): GraphNode {
    const expanded = level <= 1; // only N1 expanded by default
    return {
      id: apiNode.id,
      first_name: apiNode.first_name,
      last_name: apiNode.last_name,
      avatar: apiNode.avatar ?? null,
      city: apiNode.city,
      is_professional: apiNode.is_professional ?? false,
      is_demo: apiNode.is_demo ?? false,
      company_alias: apiNode.company_alias ?? null,
      company_category: apiNode.company_category ?? null,
      level,
      // Only build children for expanded nodes
      children: expanded ? (apiNode.children ?? []).map((c: any) => materializeNode(c, level + 1)) : [],
      childCount: apiNode.childCount ?? 0,
      loaded: true,
      expanded,
      activeRecos: 0,
      completedRecos: 0,
    };
  }

  // Expand a node lazily from raw data
  const expandNode = useCallback((nodeId: string) => {
    const raw = rawTreeRef.current;
    if (!raw) return;

    // Find the raw API node and materialize its children
    function findRaw(nodes: any[]): any | null {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        const found = findRaw(n.children ?? []);
        if (found) return found;
      }
      return null;
    }

    const rawNode = findRaw(raw);
    if (!rawNode) return;

    setTree(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      function find(node: GraphNode): boolean {
        if (node.id === nodeId) {
          if (!node.expanded && node.childCount > 0) {
            // Materialize children from raw data
            node.children = (rawNode.children ?? []).map((c: any) => materializeNode(c, node.level + 1));
            node.expanded = true;
          } else {
            node.expanded = !node.expanded;
          }
          return true;
        }
        return node.children.some(find);
      }
      find(next);
      return next;
    });
  }, []);

  // ── Single fetch for entire tree ─────────────────
  const fetchTree = useCallback(async (): Promise<GraphNode[]> => {
    const res = await fetch(`/api/network/tree?userId=${userId}&maxLevel=${maxLevel}`);
    if (!res.ok) return [];
    const data = await res.json();
    const children = data.children ?? [];
    // Store raw API data for lazy expansion
    rawTreeRef.current = children;
    return children.map((c: any) => materializeNode(c, 1));
  }, [userId, maxLevel]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const children = await fetchTree();

      const root: GraphNode = {
        id: userId,
        first_name: userName.split(" ")[0] ?? "Moi",
        last_name: userName.split(" ").slice(1).join(" ") ?? "",
        avatar: userAvatar ?? null,
        city: null,
        is_professional: false,
        is_demo: false,
        company_alias: null,
        company_category: null,
        level: 0,
        children,
        childCount: children.reduce((sum, c) => sum + 1 + c.childCount, 0),
        loaded: true,
        expanded: true,
        activeRecos: 0,
        completedRecos: 0,
      };

      setTree(root);
      setLoading(false);

      // Initialize transform after render
      requestAnimationFrame(() => applyTransform());
    })();
  }, [userId, userName, userAvatar, fetchTree, applyTransform]);



  const toggleExpand = useCallback((nodeId: string) => {
    setTree(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      function find(node: GraphNode): boolean {
        if (node.id === nodeId) {
          node.expanded = !node.expanded;
          return true;
        }
        return node.children.some(find);
      }
      find(next);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    // Suppress click if we just dragged
    const vp = viewportRef.current;
    if (vp?.dataset.wasDrag) return;
    setSelectedNode(node);
    if (node.childCount > 0 && node.level < maxLevel) expandNode(node.id);
  }, [expandNode, maxLevel]);

  const zoomIn = () => { dragState.current.scale = Math.min(dragState.current.scale + 0.2, 4); applyTransform(); rerender(n => n + 1); };
  const zoomOut = () => { dragState.current.scale = Math.max(dragState.current.scale - 0.2, 0.2); applyTransform(); rerender(n => n + 1); };
  const resetView = () => { dragState.current.scale = 1; dragState.current.tx = 0; dragState.current.ty = 0; applyTransform(); rerender(n => n + 1); };

  return (
    <div>
      {/* Legend + controls */}
      {!loading && tree && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            {["Vous", "N1", "N2", "N3", "N4", "N5"].map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LEVEL_COLORS[i] }} />
                <span className="text-[10px] text-winelio-gray font-medium">{label}</span>
              </div>
            ))}
            <div className="h-3 w-px bg-gray-200 mx-1" />
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full border-2 border-winelio-orange" style={{ animation: "winelio-ping 2s infinite" }} />
              <span className="text-[10px] text-winelio-gray font-medium">En cours</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" style={{ animation: "winelio-glow 2s infinite" }} />
              <span className="text-[10px] text-winelio-gray font-medium">Payee</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={zoomIn} className="w-8 h-8 rounded-lg bg-winelio-light flex items-center justify-center text-winelio-dark hover:bg-gray-200 active:scale-95 text-lg font-bold">+</button>
            <button onClick={zoomOut} className="w-8 h-8 rounded-lg bg-winelio-light flex items-center justify-center text-winelio-dark hover:bg-gray-200 active:scale-95 text-lg font-bold">−</button>
            <button onClick={resetView} className="h-8 px-2.5 rounded-lg bg-winelio-light flex items-center justify-center text-winelio-gray hover:bg-gray-200 active:scale-95">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <span className="text-[10px] text-winelio-gray font-mono ml-1 w-8 text-center">
              {Math.round(dragState.current.scale * 100)}%
            </span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-winelio-gray/60 text-center mb-2 sm:hidden">
        Pincez pour zoomer · Glissez pour deplacer
      </p>

      {/* Viewport - ALWAYS rendered so ref is stable for useEffect */}
      <div
        ref={viewportRef}
        className="relative rounded-xl border border-gray-100 bg-gradient-to-b from-white to-winelio-light/30 select-none"
        style={{ height: "min(65vh, 550px)", cursor: loading ? "default" : "grab", touchAction: "none", overflow: "hidden" }}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-winelio-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-winelio-gray">Construction de l&apos;arbre...</p>
          </div>
        ) : tree ? (
          <div
            ref={canvasRef}
            className="flex items-start justify-center pt-8"
            style={{ transformOrigin: "center top", minWidth: "100%", minHeight: "100%" }}
          >
            <NodeView
              node={tree}
              onClick={handleNodeClick}
              onClose={() => setSelectedNode(null)}
              events={events}
              eventsLoading={eventsLoading}
              selectedId={selectedNode?.id ?? null}
              rootLabel={rootLabel}
            />
          </div>
        ) : null}
      </div>

    </div>
  );
}

// ── Node visual component (horizontal tree) ──────────
function NodeView({ node, onClick, onClose, events, eventsLoading, selectedId, rootLabel }: {
  node: GraphNode;
  onClick: (node: GraphNode) => void;
  onClose: () => void;
  events?: NodeEvent[] | null;
  eventsLoading?: boolean;
  selectedId: string | null;
  rootLabel?: string;
}) {
  const color = LEVEL_COLORS[node.level] ?? "#9ca3af";
  const isRoot = node.level === 0;
  const isSelected = node.id === selectedId;
  const size = isRoot ? 52 : node.level <= 2 ? 42 : 34;
  const hasActive = node.activeRecos > 0 && !isRoot;
  const hasCompleted = node.completedRecos > 0 && !isRoot;
  const showKids = node.expanded && node.children.length > 0;

  return (
    <div className="flex flex-col items-center" style={{ minWidth: size + 16 }}>
      {/* Node bubble */}
      <div
        onClick={() => onClick(node)}
        className="relative flex flex-col items-center cursor-pointer"
        style={{ minWidth: size + 8 }}
      >
        {/* Root glow */}
        {isRoot && (
          <div className="absolute rounded-full animate-pulse" style={{
            backgroundColor: color, opacity: 0.2,
            width: size + 20, height: size + 20, top: -10, left: "50%", transform: "translateX(-50%)",
          }} />
        )}

        {/* Active reco ring */}
        {hasActive && (
          <div className="absolute rounded-full" style={{
            border: "3px solid #FF6B35",
            width: size + 14, height: size + 14, top: -7, left: "50%",
            transform: "translateX(-50%)",
            animation: "winelio-ping 2s ease-in-out infinite",
            zIndex: 0,
          }} />
        )}

        {/* Main circle */}
        <div
          className="relative overflow-hidden rounded-full shadow-lg"
          style={{
            backgroundColor: color,
            width: size,
            height: size,
            outline: isSelected ? `3px solid ${color}` : undefined,
            outlineOffset: 3,
            animation: hasCompleted ? "winelio-glow 2.5s ease-in-out infinite" : undefined,
            zIndex: 1,
          }}
        >
          <ProfileAvatar
            name={
              isRoot
                ? (rootLabel ?? "Vous")
                : node.is_professional && node.company_alias
                  ? node.company_alias
                  : [node.first_name, node.last_name].filter(Boolean).join(" ") || "Sans nom"
            }
            avatar={node.avatar}
            className="h-full w-full"
            imageClassName="h-full w-full object-cover"
            initialsClassName="text-white font-bold"
            fallbackClassName="bg-transparent"
          />

          {/* Demo badge */}
          {node.is_demo && !isRoot && (
            <div className="absolute flex items-center justify-center rounded-full bg-orange-100 border border-orange-200" style={{ width: 14, height: 14, bottom: -3, left: -3, zIndex: 3 }}>
              <span style={{ fontSize: 6, fontWeight: 800, color: "#FF6B35" }}>D</span>
            </div>
          )}

          {/* Green check */}
          {hasCompleted && (
            <div className="absolute flex items-center justify-center bg-green-500 rounded-full border-2 border-white shadow" style={{ width: size * 0.4, height: size * 0.4, bottom: -3, right: -3, zIndex: 2 }}>
              <svg className="text-white" style={{ width: size * 0.22, height: size * 0.22 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          {/* Active reco count */}
          {hasActive && (
            <div className="absolute flex items-center justify-center bg-winelio-orange rounded-full border-2 border-white shadow" style={{ width: size * 0.38, height: size * 0.38, top: -4, right: -4, zIndex: 2 }}>
              <span className="text-white font-bold" style={{ fontSize: size * 0.18 }}>{node.activeRecos}</span>
            </div>
          )}
        </div>

        {/* Name */}
        <span className="mt-1 text-center leading-tight truncate" style={{
          maxWidth: 70, fontSize: isRoot ? 11 : 9, fontWeight: isRoot ? 700 : 500,
          color: isRoot ? "#2D3436" : "#636E72",
        }}>
          {isRoot
            ? (rootLabel ?? "Vous")
            : node.is_professional && node.company_alias
              ? node.company_alias
              : node.level === 1
                ? (node.first_name ?? "")
                : [node.first_name, node.last_name].filter(Boolean).map((n) => `${n![0].toUpperCase()}.`).join("")}
        </span>

        {/* Expand/collapse badge */}
        {node.childCount > 0 && (
          <span className="mt-0.5 inline-flex items-center justify-center rounded-full text-white cursor-pointer select-none" style={{
            backgroundColor: color, fontSize: 8, fontWeight: 700, padding: "1px 5px", minWidth: 18,
          }}>
            {node.expanded ? "−" : "+"}{node.childCount}
          </span>
        )}

        {/* Popover */}
        {isSelected && !isRoot && (
          <div onClick={(e) => e.stopPropagation()} className="absolute left-1/2 top-full -translate-x-1/2 mt-2 w-60 rounded-xl bg-white border border-gray-200 shadow-xl cursor-default" style={{ zIndex: 50 }}>
            <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 bg-white border-l border-t border-gray-200" style={{ transform: "translateX(-50%) rotate(45deg)" }} />
            <div className="flex items-start justify-between gap-1 px-3 pt-2.5 pb-1.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-winelio-dark truncate leading-tight">
                  {node.is_professional && node.company_alias
                    ? node.company_alias
                    : [node.first_name, node.last_name].filter(Boolean).join(" ") || "Sans nom"}
                </p>
                <p className="text-[9px] text-winelio-gray truncate">
                  {node.is_professional && node.company_category && <span>{node.company_category} · </span>}
                  {node.city && <span>{node.city} · </span>}
                  N{node.level} · {node.childCount} filleul{node.childCount > 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="border-t border-gray-100 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="inline-flex w-1 h-1 rounded-full bg-winelio-orange animate-pulse" />
                <h4 className="text-[9px] font-bold text-winelio-dark uppercase tracking-wider">Actions en cours</h4>
                {events && events.length > 0 && <span className="ml-auto text-[9px] font-bold text-winelio-orange">{events.length}</span>}
              </div>
              {eventsLoading ? (
                <div className="flex items-center gap-1.5 py-1 text-[10px] text-winelio-gray">
                  <div className="w-2.5 h-2.5 border border-winelio-orange border-t-transparent rounded-full animate-spin" />
                  Chargement…
                </div>
              ) : !events || events.length === 0 ? (
                <p className="text-[10px] text-winelio-gray italic py-0.5">Aucune action en cours.</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                  {events.map((ev) => {
                    const title = ev.role === "referrer" ? ev.professional_name ?? "Recommandation" : ev.contact_name ?? "Prospect";
                    return (
                      <li key={ev.id} className="flex items-center gap-1.5 py-0.5">
                        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber text-white text-[8px] font-bold shrink-0">
                          {ev.step_order}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium text-winelio-dark truncate leading-tight">{title}</p>
                          <p className="text-[9px] text-winelio-gray truncate leading-tight">
                            {ev.step_label}{ev.amount != null && <span className="ml-1 text-winelio-orange font-semibold">· {Number(ev.amount).toLocaleString("fr-FR")} €</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Children with connectors */}
      {showKids && (
        <div className="flex flex-col items-center mt-1">
          <div className="border-l-2 border-dashed border-gray-400" style={{ height: 14 }} />
          <div className="relative flex items-start">
            {node.children.length > 1 && (
              <div className="absolute top-0 border-t-2 border-dashed border-gray-400" style={{
                left: `calc(${100 / (node.children.length * 2)}%)`,
                right: `calc(${100 / (node.children.length * 2)}%)`,
              }} />
            )}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center" style={{ padding: "0 4px" }}>
                <div className="border-l-2 border-dashed border-gray-400" style={{ height: 10 }} />
                <NodeView
                  node={child}
                  onClick={onClick}
                  onClose={onClose}
                  events={events}
                  eventsLoading={eventsLoading}
                  selectedId={selectedId}
                  rootLabel={rootLabel}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
