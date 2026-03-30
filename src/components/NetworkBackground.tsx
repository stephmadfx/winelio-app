"use client";

const CYCLE = 26; // secondes par boucle

const LINES = [
  { x1: 110, y1: 130, x2: 310, y2: 260, delay: 0.0, amber: false },
  { x1: 110, y1: 130, x2: 148, y2: 418, delay: 0.5, amber: false },
  { x1: 310, y1: 260, x2: 590, y2: 185, delay: 1.0, amber: true  },
  { x1: 310, y1: 260, x2: 475, y2: 460, delay: 1.5, amber: false },
  { x1: 590, y1: 185, x2: 730, y2: 75,  delay: 2.0, amber: false },
  { x1: 730, y1: 75,  x2: 840, y2: 295, delay: 2.5, amber: true  },
  { x1: 730, y1: 75,  x2: 1055,y2: 148, delay: 3.0, amber: false },
  { x1: 1055,y1: 148, x2: 1330,y2: 190, delay: 3.5, amber: false },
  { x1: 1330,y1: 190, x2: 1240,y2: 548, delay: 4.0, amber: true  },
  { x1: 1330,y1: 190, x2: 1385,y2: 758, delay: 4.5, amber: false },
  { x1: 840, y1: 295, x2: 960, y2: 490, delay: 5.0, amber: true  },
  { x1: 960, y1: 490, x2: 1080,y2: 710, delay: 5.5, amber: false },
  { x1: 1080,y1: 710, x2: 1240,y2: 548, delay: 6.0, amber: true  },
  { x1: 1080,y1: 710, x2: 672, y2: 645, delay: 6.5, amber: false },
  { x1: 475, y1: 460, x2: 340, y2: 615, delay: 7.0, amber: true  },
  { x1: 340, y1: 615, x2: 180, y2: 770, delay: 7.5, amber: false },
  { x1: 180, y1: 770, x2: 148, y2: 418, delay: 8.0, amber: true  },
  { x1: 672, y1: 645, x2: 340, y2: 615, delay: 8.5, amber: false },
  { x1: 1385,y1: 758, x2: 1240,y2: 548, delay: 9.0, amber: true  },
];

const HUBS = [
  { cx: 110,  cy: 130, delay: 0.1 },
  { cx: 730,  cy: 75,  delay: 2.1 },
  { cx: 1330, cy: 190, delay: 3.6 },
  { cx: 180,  cy: 770, delay: 7.6 },
  { cx: 1080, cy: 710, delay: 5.6 },
];

const NODES = [
  { cx: 110,  cy: 130, r: 7,   fill: "#FF6B35", delay: 0.1 },
  { cx: 730,  cy: 75,  r: 7,   fill: "#FF6B35", delay: 2.1 },
  { cx: 1330, cy: 190, r: 7,   fill: "#FF6B35", delay: 3.6 },
  { cx: 180,  cy: 770, r: 7,   fill: "#FF6B35", delay: 7.6 },
  { cx: 1080, cy: 710, r: 7,   fill: "#FF6B35", delay: 5.6 },
  { cx: 310,  cy: 260, r: 4.5, fill: "#F7931E", delay: 0.9 },
  { cx: 590,  cy: 185, r: 4.5, fill: "#F7931E", delay: 1.4 },
  { cx: 475,  cy: 460, r: 4.5, fill: "#F7931E", delay: 1.9 },
  { cx: 840,  cy: 295, r: 4.5, fill: "#F7931E", delay: 2.6 },
  { cx: 1055, cy: 148, r: 4.5, fill: "#F7931E", delay: 3.1 },
  { cx: 960,  cy: 490, r: 4.5, fill: "#F7931E", delay: 5.1 },
  { cx: 1240, cy: 548, r: 4.5, fill: "#F7931E", delay: 4.1 },
  { cx: 340,  cy: 615, r: 4.5, fill: "#F7931E", delay: 7.1 },
  { cx: 148,  cy: 418, r: 4.5, fill: "#F7931E", delay: 0.6 },
  { cx: 672,  cy: 645, r: 4.5, fill: "#F7931E", delay: 6.6 },
  { cx: 1385, cy: 758, r: 4.5, fill: "#F7931E", delay: 4.6 },
];

// Keyframes en 4 phases bien séparées :
//   0–25%  → tracé progressif (opacity monte doucement pendant le tracé)
//  25–72%  → tenue avec respiration lente
//  72–84%  → fondu sortant
//  84–100% → invisible (pause avant reboucle)
// Le reset du dashoffset se fait à 85% quand opacity=0, donc invisible → pas de saut visible.
const ANIMATION_CSS = `
  @keyframes kip-lineLoop {
    0%    { stroke-dashoffset: 2000; opacity: 0; }
    7%    { stroke-dashoffset: 1500; opacity: 0.5; }
    25%   { stroke-dashoffset: 0;    opacity: 0.28; }
    48%   { stroke-dashoffset: 0;    opacity: 0.14; }
    72%   { stroke-dashoffset: 0;    opacity: 0.28; }
    84%   { stroke-dashoffset: 0;    opacity: 0; }
    85%   { stroke-dashoffset: 2000; opacity: 0; }
    100%  { stroke-dashoffset: 2000; opacity: 0; }
  }

  @keyframes kip-nodeLoop {
    0%    { opacity: 0; transform: scale(0.4); }
    10%   { opacity: 0.7; transform: scale(1.08); }
    16%   { opacity: 0.55; transform: scale(1); }
    48%   { opacity: 0.35; }
    72%   { opacity: 0.58; }
    84%   { opacity: 0; transform: scale(0.85); }
    85%   { opacity: 0; transform: scale(0.4); }
    100%  { opacity: 0; transform: scale(0.4); }
  }

  @keyframes kip-ripple {
    0%    { transform: scale(1);   opacity: 0; }
    5%    { transform: scale(1.05); opacity: 0.38; }
    80%   { transform: scale(4.5); opacity: 0; }
    100%  { transform: scale(4.5); opacity: 0; }
  }
`;

export function NetworkBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        // Flou léger sur le conteneur — crée la douceur sans toucher au SVG
        // will-change hints le GPU à composer ce layer séparément
        filter: "blur(0.6px)",
        willChange: "transform",
      }}
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <style>{ANIMATION_CSS}</style>

          {/* Halo uniquement sur les 5 hubs — coût minimal */}
          <filter id="kip-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Lignes */}
        <g>
          {LINES.map((l, i) => (
            <line
              key={i}
              x1={l.x1} y1={l.y1}
              x2={l.x2} y2={l.y2}
              stroke={l.amber ? "#F7931E" : "#FF6B35"}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray="2000"
              strokeDashoffset="2000"
              fill="none"
              style={{
                animation: `kip-lineLoop ${CYCLE}s ease-in-out infinite ${l.delay}s`,
              }}
            />
          ))}
        </g>

        {/* Ondulations des hubs */}
        <g>
          {HUBS.map((h, i) => (
            <circle
              key={i}
              cx={h.cx} cy={h.cy} r="7"
              fill="none"
              stroke="#FF6B35"
              strokeWidth="1.2"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `kip-ripple 5s ease-out infinite ${h.delay + 1.8}s`,
              }}
            />
          ))}
        </g>

        {/* Nœuds */}
        <g>
          {NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.cx} cy={n.cy} r={n.r}
              fill={n.fill}
              filter={n.r === 7 ? "url(#kip-glow)" : undefined}
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
    </div>
  );
}
