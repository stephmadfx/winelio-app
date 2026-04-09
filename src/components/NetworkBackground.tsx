"use client";

/**
 * Animation réseau MLM en arrière-plan.
 * - Arbre aléatoire 7 niveaux, 2-5 branches par nœud
 * - Lignes qui se tracent niveau par niveau (animation lente)
 * - Nœuds pulsent + ripple
 * - Se réinitialise avec un nouvel arbre aléatoire en boucle
 */

import { useEffect, useRef, useState } from "react";

/* ── Types ── */
interface TNode { id: string; level: number; x: number; y: number; children: TNode[] }
interface TEdge { id: string; x1: number; y1: number; x2: number; y2: number; level: number; len: number }

/* ── Config ── */
const LEVEL_Y     = [4, 23, 42, 61, 80, 99, 118, 137];              // y par niveau (viewBox 0-145, espacement ~19)
const X_MIN       = 3;
const X_MAX       = 97;
const MAX_NODES   = [1, 5, 12, 20, 28, 34, 40, 46] as const;       // plafond par niveau
const LVL_DELAY   = [0, 1.5, 3.1, 4.8, 6.5, 8.2, 9.9, 11.6];     // délai d'apparition (s)
const DRAW_DUR    = 1.8;                                              // durée trace d'une ligne (s)
const PAUSE_AFTER = 2500;                                             // ms de pause avant fade-out
const FADE_MS     = 900;                                              // ms de fondu sortant

function rnd(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

/* ── Génération ── */
function buildTree() {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];

  function make(level: number, id: string): TNode {
    counts[level]++;
    const children: TNode[] = [];
    if (level < 7) {
      const want =
        level === 0 ? rnd(2, 5) :
        level === 1 ? rnd(2, 4) :
        level === 2 ? rnd(1, 3) :
        level === 3 ? rnd(1, 2) :
        level === 4 ? rnd(0, 2) :
        level === 5 ? rnd(0, 1) :
                      rnd(0, 1);
      for (let i = 0; i < want; i++) {
        if (counts[level + 1] < MAX_NODES[level + 1])
          children.push(make(level + 1, `${id}${i}`));
      }
    }
    return { id, level, x: 0, y: LEVEL_Y[level], children };
  }

  const root = make(0, "r");

  /* Layout horizontal (répartition par feuilles) */
  function leafCount(n: TNode): number {
    return n.children.length ? n.children.reduce((s, c) => s + leafCount(c), 0) : 1;
  }
  function layout(n: TNode, l: number, r: number) {
    n.x = (l + r) / 2;
    if (!n.children.length) return;
    const tot = leafCount(n);
    let cur = l;
    for (const c of n.children) {
      const w = (leafCount(c) / tot) * (r - l);
      layout(c, cur, cur + w);
      cur += w;
    }
  }
  layout(root, X_MIN, X_MAX);

  /* Aplatissement en listes */
  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  function flat(n: TNode) {
    nodes.push(n);
    for (const c of n.children) {
      edges.push({ id: `${n.id}>${c.id}`, x1: n.x, y1: n.y, x2: c.x, y2: c.y,
                   level: n.level, len: Math.hypot(c.x - n.x, c.y - n.y) });
      flat(c);
    }
  }
  flat(root);

  const maxLevel   = nodes.reduce((m, n) => Math.max(m, n.level), 0);
  const totalMs    = (LVL_DELAY[maxLevel] + DRAW_DUR + PAUSE_AFTER / 1000) * 1000;

  return { nodes, edges, totalMs };
}

/* ── Composant ── */
export function NetworkBackground() {
  const [data,   setData]   = useState<ReturnType<typeof buildTree> | null>(null);
  const [fading, setFading] = useState(false);
  const [gen,    setGen]    = useState(0);   // force remount du <g> pour redémarrer les animations CSS
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Init côté client uniquement */
  useEffect(() => { setData(buildTree()); }, []);

  /* Boucle : quand data change → arme les timers du cycle suivant */
  useEffect(() => {
    if (!data) return;
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [
      setTimeout(() => setFading(true), data.totalMs),
      setTimeout(() => {
        setFading(false);
        setData(buildTree());
        setGen(g => g + 1);
      }, data.totalMs + FADE_MS),
    ];
    return () => timerRef.current.forEach(clearTimeout);
  }, [data]);

  if (!data) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute left-0 right-0 bottom-0 overflow-hidden pointer-events-none z-0"
      style={{ top: 75 }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: fading ? 0 : 1,
                    transition: `opacity ${FADE_MS}ms ease` }}>
        <svg
          viewBox="0 0 100 145"
          preserveAspectRatio="xMidYMin meet"
          style={{ width: "100%", height: "100%", opacity: 0.5 }}
        >
          <defs>
            <linearGradient id="nlG" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#FF6B35" />
              <stop offset="100%" stopColor="#F7931E" />
            </linearGradient>
          </defs>

          {/* key=gen → React remonte le groupe → relance toutes les animations CSS */}
          <g key={gen}>

            {/* ── Lignes ── */}
            {data.edges.map(e => (
              <line
                key={e.id}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="url(#nlG)"
                strokeWidth="0.25"
                strokeOpacity="0.38"
                strokeLinecap="round"
                strokeDasharray={e.len}
                strokeDashoffset={e.len}
                style={{
                  animation: `nl-draw ${DRAW_DUR}s ${LVL_DELAY[e.level].toFixed(2)}s cubic-bezier(.4,0,.2,1) forwards`,
                }}
              />
            ))}

            {/* ── Nœuds ── */}
            {data.nodes.map(n => {
              const r   = [1.3, 1.0, 0.78, 0.62, 0.50, 0.40, 0.30, 0.22][n.level] ?? 0.22;
              const dIn = (LVL_DELAY[n.level] + 0.1).toFixed(2);
              const dPl = (LVL_DELAY[n.level] + 0.8).toFixed(2);
              const dur = (2.6 + (n.level % 3) * 0.45).toFixed(1);
              return (
                <g key={n.id}>
                  {n.level <= 3 && (
                    <circle cx={n.x} cy={n.y} r={r * 2.4}
                      fill="none" stroke="#FF6B35" strokeWidth="0.14"
                      style={{
                        transformBox:   "fill-box" as React.CSSProperties["transformBox"],
                        transformOrigin: "center",
                        animation: `nl-ripple ${dur}s ${dPl}s ease-out infinite`,
                      }}
                    />
                  )}
                  <circle cx={n.x} cy={n.y} r={r}
                    fill="url(#nlG)" fillOpacity={0}
                    style={{
                      animation: `nl-in .5s ${dIn}s ease forwards, nl-pulse ${dur}s ${dPl}s ease-in-out infinite`,
                    }}
                  />
                </g>
              );
            })}

          </g>

          <style>{`
            @keyframes nl-draw  { to { stroke-dashoffset: 0 } }
            @keyframes nl-in    { to { fill-opacity: .45 } }
            @keyframes nl-pulse { 0%,100%{fill-opacity:.28} 50%{fill-opacity:.55} }
            @keyframes nl-ripple {
              0%  { transform:scale(1);   stroke-opacity:.45 }
              100%{ transform:scale(4);   stroke-opacity:0   }
            }
            @media (prefers-reduced-motion:reduce) {
              line,circle { animation:none !important }
              line { stroke-dashoffset:0 !important }
            }
          `}</style>
        </svg>
      </div>
    </div>
  );
}
