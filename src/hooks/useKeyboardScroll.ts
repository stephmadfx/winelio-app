"use client";

import { useEffect } from "react";

/**
 * Remonte le champ actif dans la zone visible quand le clavier mobile s'ouvre.
 * Compatible iOS Safari + Android Chrome.
 *
 * Stratégie duale :
 * 1. `focusin` sur les inputs (primaire, cross-platform) — détecte le focus
 *    et scrolle après un délai laissant le clavier s'ouvrir complètement.
 * 2. `visualViewport.resize` (secondaire, filet de sécurité iOS) — au cas où
 *    le champ déjà focalisé se retrouve caché après redimensionnement.
 *
 * Le scroll ne s'effectue que si le champ est réellement hors de la zone
 * visible (évite les scrolls parasites sur Android qui scroll déjà).
 */
export function useKeyboardScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

    const scrollIntoViewIfNeeded = (el: Element, delay = 350) => {
      setTimeout(() => {
        const vv = window.visualViewport;
        const rect = el.getBoundingClientRect();
        const visibleHeight = vv ? vv.height : window.innerHeight;

        // Scroll uniquement si le champ est partiellement ou totalement caché
        const isHidden = rect.bottom > visibleHeight - 24 || rect.top < 0;
        if (isHidden) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, delay);
    };

    // 1. Focus sur un input → attendre l'ouverture du clavier puis vérifier
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !TAGS.has(el.tagName)) return;
      scrollIntoViewIfNeeded(el, 350);
    };

    document.addEventListener("focusin", onFocusIn);

    // 2. visualViewport resize → iOS Safari filet de sécurité
    const onViewportResize = () => {
      const el = document.activeElement;
      if (!el || !TAGS.has(el.tagName)) return;
      scrollIntoViewIfNeeded(el, 100);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onViewportResize);
    } else {
      window.addEventListener("resize", onViewportResize);
    }

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      if (vv) {
        vv.removeEventListener("resize", onViewportResize);
      } else {
        window.removeEventListener("resize", onViewportResize);
      }
    };
  }, []);
}
