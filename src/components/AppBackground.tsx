"use client";

// Très légère animation de fond pour les pages de l'app :
// quelques orbes flottants + micro-lignes, opacité ~4-7%, non intrusif.

const CSS = `
  @keyframes bz-float1 {
    0%,100% { transform: translate(0, 0) scale(1); }
    33%     { transform: translate(18px, -24px) scale(1.04); }
    66%     { transform: translate(-12px, 14px) scale(0.97); }
  }
  @keyframes bz-float2 {
    0%,100% { transform: translate(0, 0) scale(1); }
    40%     { transform: translate(-22px, 18px) scale(1.06); }
    70%     { transform: translate(14px, -10px) scale(0.95); }
  }
  @keyframes bz-float3 {
    0%,100% { transform: translate(0, 0) scale(1); }
    50%     { transform: translate(10px, 20px) scale(1.03); }
  }
  @keyframes bz-pulse {
    0%,100% { opacity: 0.07; }
    50%     { opacity: 0.14; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bz-orb, .bz-line { animation: none !important; }
  }
`;

export function AppBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none z-0"
    >
      <style>{CSS}</style>

      {/* Orbe 1 — coin haut-droit */}
      <div
        className="bz-orb absolute -top-20 -right-20 w-[560px] h-[560px] rounded-full"
        style={{
          background: "radial-gradient(circle, #FF6B35 0%, transparent 65%)",
          opacity: 0.12,
          animation: "bz-float1 28s ease-in-out infinite",
          filter: "blur(30px)",
        }}
      />

      {/* Orbe 2 — coin bas-gauche */}
      <div
        className="bz-orb absolute -bottom-24 -left-24 w-[520px] h-[520px] rounded-full"
        style={{
          background: "radial-gradient(circle, #F7931E 0%, transparent 65%)",
          opacity: 0.10,
          animation: "bz-float2 34s ease-in-out infinite 6s",
          filter: "blur(35px)",
        }}
      />

      {/* Orbe 3 — milieu droit */}
      <div
        className="bz-orb absolute top-1/3 -right-16 w-[360px] h-[360px] rounded-full"
        style={{
          background: "radial-gradient(circle, #FF6B35 0%, transparent 65%)",
          opacity: 0.07,
          animation: "bz-float3 22s ease-in-out infinite 3s",
          filter: "blur(28px)",
        }}
      />

      {/* Mini SVG : quelques nœuds très discrets */}
      <svg
        className="bz-line absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity: 0.07, animation: "bz-pulse 18s ease-in-out infinite" }}
      >
        {/* Lignes diagonales légères */}
        <line x1="80%"  y1="5%"  x2="95%"  y2="22%" stroke="#FF6B35" strokeWidth="0.6" />
        <line x1="95%"  y1="22%" x2="88%"  y2="40%" stroke="#F7931E" strokeWidth="0.5" />
        <line x1="88%"  y1="40%" x2="94%"  y2="58%" stroke="#FF6B35" strokeWidth="0.5" />
        <line x1="2%"   y1="30%" x2="6%"   y2="55%" stroke="#F7931E" strokeWidth="0.5" />
        <line x1="6%"   y1="55%" x2="3%"   y2="75%" stroke="#FF6B35" strokeWidth="0.4" />
        {/* Nœuds */}
        <circle cx="80%" cy="5%"  r="2.5" fill="#FF6B35" />
        <circle cx="95%" cy="22%" r="2"   fill="#F7931E" />
        <circle cx="88%" cy="40%" r="1.8" fill="#FF6B35" />
        <circle cx="94%" cy="58%" r="1.5" fill="#F7931E" />
        <circle cx="2%"  cy="30%" r="2"   fill="#F7931E" />
        <circle cx="6%"  cy="55%" r="1.8" fill="#FF6B35" />
        <circle cx="3%"  cy="75%" r="1.5" fill="#F7931E" />
      </svg>
    </div>
  );
}
