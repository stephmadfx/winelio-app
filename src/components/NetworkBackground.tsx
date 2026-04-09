"use client";

// Arbre MLM animé en arrière-plan — pur SVG + CSS, aucun JS loop.
// 14 nœuds sur 4 niveaux. Lignes qui se tracent, nœuds qui pulsent.

type Pt = { cx: number; cy: number };

const NODES: Pt[] = [
  { cx: 50, cy: 9  },  // 0 root
  { cx: 29, cy: 27 },  // 1 L1
  { cx: 71, cy: 27 },  // 2 L1
  { cx: 14, cy: 47 },  // 3 L2
  { cx: 38, cy: 46 },  // 4 L2
  { cx: 62, cy: 46 },  // 5 L2
  { cx: 86, cy: 47 },  // 6 L2
  { cx: 6,  cy: 70 },  // 7 L3
  { cx: 20, cy: 68 },  // 8 L3
  { cx: 34, cy: 69 },  // 9 L3
  { cx: 50, cy: 71 },  // 10 L3
  { cx: 66, cy: 69 },  // 11 L3
  { cx: 80, cy: 68 },  // 12 L3
  { cx: 94, cy: 70 },  // 13 L3
];

const EDGES: [number, number][] = [
  [0, 1], [0, 2],
  [1, 3], [1, 4],
  [2, 5], [2, 6],
  [3, 7], [3, 8],
  [4, 9], [4, 10],
  [5, 10],[5, 11],
  [6, 12],[6, 13],
];

function nodeR(i: number) {
  if (i === 0) return 1.1;
  if (i <= 2)  return 0.8;
  if (i <= 6)  return 0.65;
  return 0.5;
}

export function NetworkBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none z-0"
    >
      <svg
        viewBox="0 0 100 82"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.55 }}
      >
        <defs>
          <linearGradient id="nlGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FF6B35" />
            <stop offset="100%" stopColor="#F7931E" />
          </linearGradient>
        </defs>

        {EDGES.map(([a, b], i) => {
          const A = NODES[a], B = NODES[b];
          const len = Math.hypot(B.cx - A.cx, B.cy - A.cy);
          const delay = (0.3 + i * 0.13).toFixed(2);
          return (
            <line
              key={"e" + i}
              x1={A.cx} y1={A.cy} x2={B.cx} y2={B.cy}
              stroke="url(#nlGrad)"
              strokeWidth="0.22"
              strokeOpacity="0.35"
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len}
              style={{
                animation: "nl-draw 1.6s " + delay + "s cubic-bezier(.4,0,.2,1) forwards",
              }}
            />
          );
        })}

        {NODES.map((n, i) => {
          const r   = nodeR(i);
          const d1  = (0.15 + i * 0.1).toFixed(2);
          const d2  = (0.75 + i * 0.1).toFixed(2);
          const dur = (2.8 + (i % 4) * 0.5).toFixed(1);
          return (
            <g key={"n" + i}>
              {i <= 6 && (
                <circle
                  cx={n.cx} cy={n.cy} r={r * 2.2}
                  fill="none"
                  stroke="#FF6B35"
                  strokeWidth="0.18"
                  style={{
                    transformBox: "fill-box" as React.CSSProperties["transformBox"],
                    transformOrigin: "center",
                    animation: "nl-ripple " + dur + "s " + d2 + "s ease-out infinite",
                  }}
                />
              )}
              <circle
                cx={n.cx} cy={n.cy} r={r}
                fill="url(#nlGrad)"
                fillOpacity={0}
                style={{
                  animation:
                    "nl-in .5s " + d1 + "s ease forwards, " +
                    "nl-pulse " + dur + "s " + d2 + "s ease-in-out infinite",
                }}
              />
            </g>
          );
        })}

        <style>{`
          @keyframes nl-draw  { to { stroke-dashoffset: 0; } }
          @keyframes nl-in    { to { fill-opacity: .45; } }
          @keyframes nl-pulse {
            0%,100% { fill-opacity: .3; }
            50%     { fill-opacity: .6; }
          }
          @keyframes nl-ripple {
            0%   { transform: scale(1);   stroke-opacity: .5; }
            100% { transform: scale(3.5); stroke-opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            line, circle { animation: none !important; }
            line { stroke-dashoffset: 0 !important; }
          }
        `}</style>
      </svg>
    </div>
  );
}
