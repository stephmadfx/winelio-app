"use client";

import { useState, useEffect, useCallback, useRef } from "react";
interface GraphNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  level: number;
  children: GraphNode[];
  childCount: number;
  loaded: boolean;
  expanded: boolean;
  activeRecos: number;
  completedRecos: number;
}

const LEVEL_COLORS = [
  "#FF6B35", "#F7931E", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA",
];

export function NetworkGraph({ userId, userName }: { userId: string; userName: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, tx: 0, ty: 0, scale: 1 });

  const [tree, setTree] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
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
      if (e.touches.length !== 1) return;
      moved = false;
      mouseStartX = e.touches[0].clientX;
      mouseStartY = e.touches[0].clientY;
      dragState.current.startX = e.touches[0].clientX - dragState.current.tx;
      dragState.current.startY = e.touches[0].clientY - dragState.current.ty;
      dragState.current.dragging = true;
    }

    function onTouchMove(e: TouchEvent) {
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

  // ── Data loading (via API Route to bypass RLS) ─────
  const fetchChildren = useCallback(async (parentId: string, level: number): Promise<GraphNode[]> => {
    const res = await fetch(`/api/network/children?parentId=${parentId}`);
    if (!res.ok) return [];
    const { children } = await res.json();

    return (children ?? []).map((c: { id: string; first_name: string | null; last_name: string | null; childCount: number; activeRecos: number; completedRecos: number }) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      level,
      children: [],
      childCount: c.childCount,
      loaded: false,
      expanded: false,
      activeRecos: c.activeRecos,
      completedRecos: c.completedRecos,
    }));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const children = await fetchChildren(userId, 1);
      const totalDirect = children.length;

      const root: GraphNode = {
        id: userId,
        first_name: userName.split(" ")[0] ?? "Moi",
        last_name: userName.split(" ").slice(1).join(" ") ?? "",
        level: 0,
        children,
        childCount: totalDirect ?? 0,
        loaded: true,
        expanded: true,
        activeRecos: 0,
        completedRecos: 0,
      };

      // Auto-expand L1
      for (const child of root.children) {
        if (child.childCount > 0) {
          child.children = await fetchChildren(child.id, 2);
          child.loaded = true;
          child.expanded = true;
        }
      }

      setTree(root);
      setLoading(false);

      // Initialize transform after render
      requestAnimationFrame(() => applyTransform());
    })();
  }, [userId, userName, fetchChildren, applyTransform]);

  const toggleExpand = useCallback(async (nodeId: string) => {
    setTree(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      function find(node: GraphNode): boolean {
        if (node.id === nodeId) {
          if (!node.loaded && node.childCount > 0) {
            node.expanded = true;
            fetchChildren(node.id, node.level + 1).then(kids => {
              setTree(p => {
                if (!p) return p;
                const u = structuredClone(p);
                function set(n: GraphNode): boolean {
                  if (n.id === nodeId) { n.children = kids; n.loaded = true; return true; }
                  return n.children.some(set);
                }
                set(u);
                return u;
              });
            });
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
  }, [fetchChildren]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    // Suppress click if we just dragged
    const vp = viewportRef.current;
    if (vp?.dataset.wasDrag) return;
    setSelectedNode(node);
    if (node.childCount > 0 && node.level < 5) toggleExpand(node.id);
  }, [toggleExpand]);

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
                <span className="text-[10px] text-kiparlo-gray font-medium">{label}</span>
              </div>
            ))}
            <div className="h-3 w-px bg-gray-200 mx-1" />
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full border-2 border-kiparlo-orange" style={{ animation: "kiparlo-ping 2s infinite" }} />
              <span className="text-[10px] text-kiparlo-gray font-medium">En cours</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" style={{ animation: "kiparlo-glow 2s infinite" }} />
              <span className="text-[10px] text-kiparlo-gray font-medium">Payee</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={zoomIn} className="w-8 h-8 rounded-lg bg-kiparlo-light flex items-center justify-center text-kiparlo-dark hover:bg-gray-200 active:scale-95 text-lg font-bold">+</button>
            <button onClick={zoomOut} className="w-8 h-8 rounded-lg bg-kiparlo-light flex items-center justify-center text-kiparlo-dark hover:bg-gray-200 active:scale-95 text-lg font-bold">−</button>
            <button onClick={resetView} className="h-8 px-2.5 rounded-lg bg-kiparlo-light flex items-center justify-center text-kiparlo-gray hover:bg-gray-200 active:scale-95">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <span className="text-[10px] text-kiparlo-gray font-mono ml-1 w-8 text-center">
              {Math.round(dragState.current.scale * 100)}%
            </span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-kiparlo-gray/60 text-center mb-2 sm:hidden">
        Pincez pour zoomer · Glissez pour deplacer
      </p>

      {/* Viewport - ALWAYS rendered so ref is stable for useEffect */}
      <div
        ref={viewportRef}
        className="relative rounded-xl border border-gray-100 bg-gradient-to-b from-white to-kiparlo-light/30 select-none"
        style={{ height: "min(65vh, 550px)", cursor: loading ? "default" : "grab", touchAction: "none", overflow: "hidden" }}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-kiparlo-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-kiparlo-gray">Construction de l&apos;arbre...</p>
          </div>
        ) : tree ? (
          <div
            ref={canvasRef}
            className="flex items-start justify-center pt-8"
            style={{ transformOrigin: "center top", minWidth: "100%", minHeight: "100%" }}
          >
            <NodeView node={tree} onClick={handleNodeClick} selectedId={selectedNode?.id ?? null} />
          </div>
        ) : null}
      </div>

      {/* Selected node info */}
      {selectedNode && selectedNode.id !== userId && (
        <div className="mt-3 p-3 sm:p-4 rounded-xl bg-white border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                style={{ backgroundColor: LEVEL_COLORS[selectedNode.level] ?? "#9ca3af" }}>
                {[selectedNode.first_name, selectedNode.last_name].filter(Boolean).map(n => n![0]).join("").toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-kiparlo-dark text-sm">
                  {[selectedNode.first_name, selectedNode.last_name].filter(Boolean).join(" ")}
                </p>
                <p className="text-xs text-kiparlo-gray">
                  Niveau {selectedNode.level} · {selectedNode.childCount} membre{selectedNode.childCount !== 1 ? "s" : ""}
                  {selectedNode.activeRecos > 0 && <span className="ml-2 text-kiparlo-orange font-medium">{selectedNode.activeRecos} en cours</span>}
                  {selectedNode.completedRecos > 0 && <span className="ml-2 text-green-600 font-medium">{selectedNode.completedRecos} terminee{selectedNode.completedRecos > 1 ? "s" : ""}</span>}
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedNode(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Node visual component ────────────────────────────
function NodeView({ node, onClick, selectedId }: {
  node: GraphNode;
  onClick: (node: GraphNode) => void;
  selectedId: string | null;
}) {
  const color = LEVEL_COLORS[node.level] ?? "#9ca3af";
  const initials = [node.first_name, node.last_name].filter(Boolean).map(n => n![0]).join("").toUpperCase();
  const isRoot = node.level === 0;
  const isSelected = node.id === selectedId;
  const size = isRoot ? 56 : node.level <= 2 ? 44 : 36;
  const hasActive = node.activeRecos > 0 && !isRoot;
  const hasCompleted = node.completedRecos > 0 && !isRoot;
  const showKids = node.expanded && node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Node button */}
      <div
        onClick={() => onClick(node)}
        className="relative flex flex-col items-center cursor-pointer"
        style={{ minWidth: size + 24 }}
      >
        {/* Root glow */}
        {isRoot && (
          <div className="absolute rounded-full animate-pulse" style={{
            backgroundColor: color, opacity: 0.2,
            width: size + 20, height: size + 20, top: -10, left: "50%", transform: "translateX(-50%)",
          }} />
        )}

        {/* Active reco: pulsing orange ring */}
        {hasActive && (
          <div className="absolute rounded-full" style={{
            border: "3px solid #FF6B35",
            width: size + 14, height: size + 14, top: -7, left: "50%",
            animation: "kiparlo-ping 2s ease-in-out infinite",
            zIndex: 0,
          }} />
        )}

        {/* Main circle */}
        <div className="relative rounded-full flex items-center justify-center text-white font-bold shadow-lg" style={{
          backgroundColor: color, width: size, height: size,
          fontSize: isRoot ? 16 : node.level <= 2 ? 13 : 11,
          outline: isSelected ? `3px solid ${color}` : undefined, outlineOffset: 3,
          animation: hasCompleted ? "kiparlo-glow 2.5s ease-in-out infinite" : undefined,
          zIndex: 1,
        }}>
          <svg className="absolute inset-0 w-full h-full opacity-15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span className="relative z-10">{initials}</span>

          {/* Green check badge */}
          {hasCompleted && (
            <div className="absolute flex items-center justify-center bg-green-500 rounded-full border-2 border-white shadow" style={{
              width: size * 0.4, height: size * 0.4, bottom: -3, right: -3, zIndex: 2,
            }}>
              <svg className="text-white" style={{ width: size * 0.22, height: size * 0.22 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          {/* Active reco count */}
          {hasActive && (
            <div className="absolute flex items-center justify-center bg-kiparlo-orange rounded-full border-2 border-white shadow animate-bounce" style={{
              width: size * 0.38, height: size * 0.38, top: -4, right: -4, zIndex: 2, animationDuration: "2s",
            }}>
              <span className="text-white font-bold" style={{ fontSize: size * 0.19 }}>{node.activeRecos}</span>
            </div>
          )}
        </div>

        {/* Name */}
        <span className="mt-1 text-center leading-tight truncate" style={{
          maxWidth: 70, fontSize: isRoot ? 11 : 9, fontWeight: isRoot ? 700 : 500,
          color: isRoot ? "#2D3436" : "#636E72",
        }}>
          {isRoot ? "Vous" : (node.first_name ?? "")}
        </span>

        {/* Expand badge */}
        {node.childCount > 0 && (
          <span className="mt-0.5 inline-flex items-center justify-center rounded-full text-white" style={{
            backgroundColor: color, fontSize: 8, fontWeight: 700, padding: "1px 5px", minWidth: 18,
          }}>
            {node.expanded ? "−" : "+"}{node.childCount}
          </span>
        )}
      </div>

      {/* Children with connectors */}
      {showKids && (
        <div className="flex flex-col items-center mt-1">
          <div className="border-l border-dashed border-gray-300" style={{ height: 16 }} />
          <div className="relative flex items-start">
            {node.children.length > 1 && (
              <div className="absolute top-0 border-t border-dashed border-gray-300" style={{
                left: `calc(${100 / (node.children.length * 2)}%)`,
                right: `calc(${100 / (node.children.length * 2)}%)`,
              }} />
            )}
            {node.children.map(child => (
              <div key={child.id} className="flex flex-col items-center" style={{ padding: "0 4px" }}>
                <div className="border-l border-dashed border-gray-300" style={{ height: 12 }} />
                <NodeView node={child} onClick={onClick} selectedId={selectedId} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {node.expanded && !node.loaded && node.childCount > 0 && (
        <div className="mt-2 flex flex-col items-center">
          <div className="border-l border-dashed border-gray-300" style={{ height: 12 }} />
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: color, borderTopColor: "transparent" }} />
        </div>
      )}
    </div>
  );
}
