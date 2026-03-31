"use client";

// Desktop : arbre large 1440×900
// Mobile  : arbre compact 390×844 (même logique, positions resserrées)
// Dans les deux cas : connexions strictement parent → enfant (haut → bas),
// pas de connexions latérales entre branches, déploiement séquentiel gauche→centre→droite.

const CYCLE = 42;

type Line = { x1: number; y1: number; x2: number; y2: number; delay: number; amber: boolean };
type Node = { cx: number; cy: number; r: number; fill: string; delay: number };
type Hub  = { cx: number; cy: number; delay: number };

// ─── DESKTOP 1440×900 ────────────────────────────────────────────────────────

const LINES_D: Line[] = [
  // Root → L1
  { x1: 720, y1: 62,  x2: 305,  y2: 178, delay: 0.8,  amber: true  },
  { x1: 720, y1: 62,  x2: 718,  y2: 188, delay: 1.5,  amber: false },
  { x1: 720, y1: 62,  x2: 1148, y2: 170, delay: 2.2,  amber: false },
  // Branche gauche — chaîne principale
  { x1: 305,  y1: 178, x2: 148,  y2: 322, delay: 1.6,  amber: true  },
  { x1: 148,  y1: 322, x2: 88,   y2: 478, delay: 2.6,  amber: true  },
  { x1: 88,   y1: 478, x2: 58,   y2: 635, delay: 3.6,  amber: true  },
  { x1: 58,   y1: 635, x2: 38,   y2: 795, delay: 4.6,  amber: true  },
  // Branches latérales gauche
  { x1: 148,  y1: 322, x2: 198,  y2: 515, delay: 4.0,  amber: false },
  { x1: 305,  y1: 178, x2: 382,  y2: 352, delay: 3.2,  amber: false },
  // Branche centrale
  { x1: 718,  y1: 188, x2: 858,  y2: 330, delay: 5.5,  amber: false },
  { x1: 858,  y1: 330, x2: 822,  y2: 492, delay: 6.5,  amber: false },
  { x1: 822,  y1: 492, x2: 908,  y2: 650, delay: 7.5,  amber: false },
  { x1: 858,  y1: 330, x2: 978,  y2: 488, delay: 7.0,  amber: false },
  { x1: 718,  y1: 188, x2: 622,  y2: 345, delay: 6.0,  amber: false },
  { x1: 622,  y1: 345, x2: 588,  y2: 502, delay: 7.2,  amber: false },
  // Branche droite
  { x1: 1148, y1: 170, x2: 1062, y2: 325, delay: 8.5,  amber: false },
  { x1: 1062, y1: 325, x2: 1025, y2: 488, delay: 9.5,  amber: false },
  { x1: 1025, y1: 488, x2: 1052, y2: 648, delay: 10.5, amber: false },
  { x1: 1148, y1: 170, x2: 1252, y2: 302, delay: 9.0,  amber: false },
  { x1: 1252, y1: 302, x2: 1195, y2: 462, delay: 10.0, amber: false },
  { x1: 1252, y1: 302, x2: 1362, y2: 448, delay: 10.5, amber: false },
  { x1: 1362, y1: 448, x2: 1398, y2: 610, delay: 11.5, amber: false },
  { x1: 1398, y1: 610, x2: 1425, y2: 775, delay: 12.5, amber: false },
];

const HUBS_D: Hub[] = [
  { cx: 720, cy: 62,  delay: 0.3 },
  { cx: 718, cy: 188, delay: 2.0 },
  { cx: 822, cy: 492, delay: 7.2 },
];

const NODES_D: Node[] = [
  { cx: 720,  cy: 62,  r: 8,   fill: "#FF6B35", delay: 0.2  },
  { cx: 305,  cy: 178, r: 5.5, fill: "#FF6B35", delay: 1.4  },
  { cx: 718,  cy: 188, r: 5.5, fill: "#F7931E", delay: 2.0  },
  { cx: 1148, cy: 170, r: 5.5, fill: "#F7931E", delay: 2.8  },
  { cx: 148,  cy: 322, r: 4.5, fill: "#FF6B35", delay: 2.3  },
  { cx: 88,   cy: 478, r: 4,   fill: "#FF6B35", delay: 3.3  },
  { cx: 58,   cy: 635, r: 3.5, fill: "#FF6B35", delay: 4.3  },
  { cx: 38,   cy: 795, r: 3,   fill: "#FF6B35", delay: 5.3  },
  { cx: 198,  cy: 515, r: 3.5, fill: "#F7931E", delay: 4.8  },
  { cx: 382,  cy: 352, r: 4,   fill: "#F7931E", delay: 3.9  },
  { cx: 858,  cy: 330, r: 4.5, fill: "#F7931E", delay: 6.2  },
  { cx: 822,  cy: 492, r: 5,   fill: "#FF6B35", delay: 7.2  },
  { cx: 908,  cy: 650, r: 3.5, fill: "#F7931E", delay: 8.2  },
  { cx: 978,  cy: 488, r: 3.5, fill: "#F7931E", delay: 7.8  },
  { cx: 622,  cy: 345, r: 4,   fill: "#F7931E", delay: 6.8  },
  { cx: 588,  cy: 502, r: 3.5, fill: "#F7931E", delay: 8.0  },
  { cx: 1062, cy: 325, r: 4.5, fill: "#F7931E", delay: 9.2  },
  { cx: 1025, cy: 488, r: 4,   fill: "#F7931E", delay: 10.2 },
  { cx: 1052, cy: 648, r: 3.5, fill: "#F7931E", delay: 11.2 },
  { cx: 1252, cy: 302, r: 4,   fill: "#F7931E", delay: 9.8  },
  { cx: 1195, cy: 462, r: 3.5, fill: "#F7931E", delay: 10.8 },
  { cx: 1362, cy: 448, r: 3.5, fill: "#F7931E", delay: 11.3 },
  { cx: 1398, cy: 610, r: 3,   fill: "#F7931E", delay: 12.3 },
  { cx: 1425, cy: 775, r: 3,   fill: "#F7931E", delay: 13.3 },
];

// ─── MOBILE 390×844 ──────────────────────────────────────────────────────────
//
//  ROOT (195, 52)
//  ├─ A  (68, 158) ────────── branche gauche (1re)
//  │  ├─ D  (30, 295)
//  │  │  ├─ G  (14, 438)
//  │  │  │  └─ K  ( 8, 585)
//  │  │  │     └─ O  ( 5, 735) ← niv.5
//  │  │  └─ H  (88, 312)
//  │  └─ E  (105, 278)
//  ├─ B  (192, 172) ────────── branche centrale (2e)
//  │  ├─ F  (155, 308)
//  │  │  └─ J  (142, 452)
//  │  └─ L  (238, 298)
//  │     ├─ M  (252, 448)
//  │     │  └─ P  (262, 595) ← niv.4
//  │     └─ N  (282, 442)
//  └─ C  (322, 162) ────────── branche droite (3e)
//     ├─ R  (288, 302)
//     │  └─ S  (272, 452)
//     │     └─ T  (265, 598) ← niv.4
//     └─ U  (358, 292)
//        └─ W  (368, 442)
//           └─ X  (375, 590)
//              └─ Y  (380, 738) ← niv.5

const LINES_M: Line[] = [
  // Root → L1
  { x1: 195, y1: 52,  x2: 68,  y2: 158, delay: 0.8,  amber: true  },
  { x1: 195, y1: 52,  x2: 192, y2: 172, delay: 1.5,  amber: false },
  { x1: 195, y1: 52,  x2: 322, y2: 162, delay: 2.2,  amber: false },
  // Branche gauche — chaîne principale
  { x1: 68,  y1: 158, x2: 30,  y2: 295, delay: 1.6,  amber: true  },
  { x1: 30,  y1: 295, x2: 14,  y2: 438, delay: 2.6,  amber: true  },
  { x1: 14,  y1: 438, x2: 8,   y2: 585, delay: 3.6,  amber: true  },
  { x1: 8,   y1: 585, x2: 5,   y2: 735, delay: 4.6,  amber: true  },
  // Latérales gauche
  { x1: 30,  y1: 295, x2: 88,  y2: 312, delay: 4.0,  amber: false },
  { x1: 68,  y1: 158, x2: 105, y2: 278, delay: 3.2,  amber: false },
  // Branche centrale
  { x1: 192, y1: 172, x2: 238, y2: 298, delay: 5.5,  amber: false },
  { x1: 238, y1: 298, x2: 252, y2: 448, delay: 6.5,  amber: false },
  { x1: 252, y1: 448, x2: 262, y2: 595, delay: 7.5,  amber: false },
  { x1: 238, y1: 298, x2: 282, y2: 442, delay: 7.0,  amber: false },
  { x1: 192, y1: 172, x2: 155, y2: 308, delay: 6.0,  amber: false },
  { x1: 155, y1: 308, x2: 142, y2: 452, delay: 7.2,  amber: false },
  // Branche droite
  { x1: 322, y1: 162, x2: 288, y2: 302, delay: 8.5,  amber: false },
  { x1: 288, y1: 302, x2: 272, y2: 452, delay: 9.5,  amber: false },
  { x1: 272, y1: 452, x2: 265, y2: 598, delay: 10.5, amber: false },
  { x1: 322, y1: 162, x2: 358, y2: 292, delay: 9.0,  amber: false },
  { x1: 358, y1: 292, x2: 368, y2: 442, delay: 10.0, amber: false },
  { x1: 368, y1: 442, x2: 375, y2: 590, delay: 11.5, amber: false },
  { x1: 375, y1: 590, x2: 380, y2: 738, delay: 12.5, amber: false },
];

const HUBS_M: Hub[] = [
  { cx: 195, cy: 52,  delay: 0.3 },
  { cx: 192, cy: 172, delay: 2.0 },
  { cx: 252, cy: 448, delay: 7.2 },
];

const NODES_M: Node[] = [
  { cx: 195, cy: 52,  r: 7,   fill: "#FF6B35", delay: 0.2  },
  { cx: 68,  cy: 158, r: 5,   fill: "#FF6B35", delay: 1.4  },
  { cx: 192, cy: 172, r: 5,   fill: "#F7931E", delay: 2.0  },
  { cx: 322, cy: 162, r: 5,   fill: "#F7931E", delay: 2.8  },
  { cx: 30,  cy: 295, r: 4,   fill: "#FF6B35", delay: 2.3  },
  { cx: 14,  cy: 438, r: 3.5, fill: "#FF6B35", delay: 3.3  },
  { cx: 8,   cy: 585, r: 3,   fill: "#FF6B35", delay: 4.3  },
  { cx: 5,   cy: 735, r: 2.5, fill: "#FF6B35", delay: 5.3  },
  { cx: 88,  cy: 312, r: 3,   fill: "#F7931E", delay: 4.8  },
  { cx: 105, cy: 278, r: 3.5, fill: "#F7931E", delay: 3.9  },
  { cx: 238, cy: 298, r: 4,   fill: "#F7931E", delay: 6.2  },
  { cx: 252, cy: 448, r: 4.5, fill: "#FF6B35", delay: 7.2  },
  { cx: 262, cy: 595, r: 3,   fill: "#F7931E", delay: 8.2  },
  { cx: 282, cy: 442, r: 3,   fill: "#F7931E", delay: 7.8  },
  { cx: 155, cy: 308, r: 3.5, fill: "#F7931E", delay: 6.8  },
  { cx: 142, cy: 452, r: 3,   fill: "#F7931E", delay: 8.0  },
  { cx: 288, cy: 302, r: 4,   fill: "#F7931E", delay: 9.2  },
  { cx: 272, cy: 452, r: 3.5, fill: "#F7931E", delay: 10.2 },
  { cx: 265, cy: 598, r: 3,   fill: "#F7931E", delay: 11.2 },
  { cx: 358, cy: 292, r: 3.5, fill: "#F7931E", delay: 9.8  },
  { cx: 368, cy: 442, r: 3,   fill: "#F7931E", delay: 10.8 },
  { cx: 375, cy: 590, r: 2.5, fill: "#F7931E", delay: 11.3 },
  { cx: 380, cy: 738, r: 2.5, fill: "#F7931E", delay: 12.3 },
];

// ─── Animation ───────────────────────────────────────────────────────────────

const ANIMATION_CSS = `
  @keyframes kip-lineLoop {
    0%    { stroke-dashoffset: 1600; opacity: 0; }
    5%    { stroke-dashoffset: 1000; opacity: 0.55; }
    20%   { stroke-dashoffset: 0;    opacity: 0.28; }
    50%   { stroke-dashoffset: 0;    opacity: 0.12; }
    78%   { stroke-dashoffset: 0;    opacity: 0.28; }
    88%   { stroke-dashoffset: 0;    opacity: 0; }
    89%   { stroke-dashoffset: 1600; opacity: 0; }
    100%  { stroke-dashoffset: 1600; opacity: 0; }
  }

  @keyframes kip-nodeLoop {
    0%    { opacity: 0; transform: scale(0.3); }
    8%    { opacity: 0.8; transform: scale(1.12); }
    14%   { opacity: 0.58; transform: scale(1); }
    50%   { opacity: 0.3; }
    78%   { opacity: 0.55; }
    88%   { opacity: 0; transform: scale(0.8); }
    89%   { opacity: 0; transform: scale(0.3); }
    100%  { opacity: 0; transform: scale(0.3); }
  }

  @keyframes kip-ripple {
    0%   { transform: scale(1);    opacity: 0; }
    4%   { transform: scale(1.05); opacity: 0.32; }
    82%  { transform: scale(5.5);  opacity: 0; }
    100% { transform: scale(5.5);  opacity: 0; }
  }
`;

// ─── Composant SVG générique ─────────────────────────────────────────────────

function TreeSVG({
  viewBox,
  lines,
  hubs,
  nodes,
  className,
}: {
  viewBox: string;
  lines: Line[];
  hubs: Hub[];
  nodes: Node[];
  className?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <style>{ANIMATION_CSS}</style>
        <filter id="kip-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Connexions */}
      <g>
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.amber ? "#F7931E" : "#FF6B35"}
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeDasharray="1600"
            strokeDashoffset="1600"
            fill="none"
            style={{ animation: `kip-lineLoop ${CYCLE}s ease-in-out infinite ${l.delay}s` }}
          />
        ))}
      </g>

      {/* Ondes */}
      <g>
        {hubs.map((h, i) => (
          <circle
            key={i}
            cx={h.cx} cy={h.cy} r="7"
            fill="none"
            stroke="#FF6B35"
            strokeWidth="1.1"
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `kip-ripple 5.5s ease-out infinite ${h.delay + 2}s`,
            }}
          />
        ))}
      </g>

      {/* Nœuds */}
      <g>
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.cx} cy={n.cy} r={n.r}
            fill={n.fill}
            filter={n.r >= 7 ? "url(#kip-glow)" : undefined}
            style={{
              opacity: 0,
              transformBox: "fill-box",
              transformOrigin: "center",
              animation: `kip-nodeLoop ${CYCLE}s ease-in-out infinite ${n.delay}s`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function NetworkBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        filter: "blur(0.6px)",
        willChange: "transform",
      }}
    >
      {/* Desktop */}
      <TreeSVG
        viewBox="0 0 1440 900"
        lines={LINES_D}
        hubs={HUBS_D}
        nodes={NODES_D}
        className="hidden md:block w-full h-full"
      />
      {/* Mobile — arbre resserré pour tenir dans 390px */}
      <TreeSVG
        viewBox="0 0 390 844"
        lines={LINES_M}
        hubs={HUBS_M}
        nodes={NODES_M}
        className="block md:hidden w-full h-full"
      />
    </div>
  );
}
