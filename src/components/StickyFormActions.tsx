"use client";

import { useEffect, useRef } from "react";

/**
 * Sur mobile : barre fixe en bas qui remonte au-dessus du clavier
 * quand il s'ouvre, en suivant visualViewport.
 * Sur desktop (lg+) : div inline normale.
 */
export function StickyFormActions({
  children,
}: {
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pas de tracking sur desktop
    if (window.innerWidth >= 1024) return;

    const el = ref.current;
    const vv = window.visualViewport;
    if (!vv || !el) return;

    const update = () => {
      // Hauteur cachée en bas = layout height - (visual height + visual offset)
      const hiddenBottom = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
      );
      el.style.bottom = `${hiddenBottom}px`;
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <>
      {/* Mobile : barre fixe qui suit le clavier */}
      <div
        ref={ref}
        className="
          fixed left-0 right-0 bottom-0 z-40
          flex items-center justify-between
          gap-3 px-4 py-3
          bg-kiparlo-light/95 backdrop-blur-sm
          border-t border-kiparlo-gray/15
          transition-[bottom] duration-75
          lg:hidden
        "
      >
        {children}
      </div>

      {/* Desktop : inline normal */}
      <div className="hidden lg:flex mt-10 items-center justify-between">
        {children}
      </div>
    </>
  );
}
