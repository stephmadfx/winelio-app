"use client";

import { useEffect } from "react";

/**
 * Fait remonter le champ actif dans la zone visible quand le clavier
 * mobile s'ouvre (iOS Safari + Android Chrome).
 *
 * - visualViewport.resize : seule API fiable sur iOS (window.innerHeight
 *   ne change pas quand le clavier s'ouvre sur Safari)
 * - scrollIntoView({ block: "center" }) : centre le champ dans le viewport
 * - setTimeout 300ms : iOS a besoin du délai avant recalcul des positions
 */
export function useKeyboardScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

    const scrollFocusedIntoView = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !TAGS.has(el.tagName)) return;

      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", scrollFocusedIntoView);
      return () => vv.removeEventListener("resize", scrollFocusedIntoView);
    }

    // Fallback pour navigateurs sans visualViewport
    window.addEventListener("resize", scrollFocusedIntoView);
    return () => window.removeEventListener("resize", scrollFocusedIntoView);
  }, []);
}
