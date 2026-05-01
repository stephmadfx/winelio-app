"use client";

import { useLayoutEffect, useRef } from "react";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function BetaBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!DEMO_MODE) return;
    const el = ref.current;
    if (!el) return;

    const root = document.documentElement;
    const setVar = () => {
      root.style.setProperty("--beta-banner-h", `${el.offsetHeight}px`);
    };

    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    window.addEventListener("resize", setVar);
    window.addEventListener("orientationchange", setVar);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setVar);
      window.removeEventListener("orientationchange", setVar);
      root.style.removeProperty("--beta-banner-h");
    };
  }, []);

  if (!DEMO_MODE) return null;

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-400/95 backdrop-blur-sm px-3 py-1.5 text-amber-900 select-none pointer-events-none"
    >
      <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-700 animate-pulse" />

      {/* Mobile : version courte */}
      <span className="text-[10px] font-medium leading-tight sm:hidden text-center">
        🧪 <strong>Bêta test</strong> — Un réseau démo est créé pour vous · données fictives · retraits désactivés ·{" "}
        <span className="underline decoration-dotted">parrainages réels conservés</span>
      </span>

      {/* Desktop : version complète */}
      <span className="hidden sm:inline text-[11px] font-medium tracking-wide text-center">
        🧪 <strong>Phase bêta</strong> — Un réseau de démonstration est créé automatiquement pour vous montrer le fonctionnement de l&apos;application.
        Toutes ces données sont <strong>fictives</strong>. Les retraits sont <strong>désactivés</strong>.
        Vos <strong className="underline decoration-dotted">parrainages réels sont enregistrés</strong> et seront conservés au lancement.
      </span>
    </div>
  );
}
