"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_URL_DESKTOP = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo.mp4";
const VIDEO_URL_MOBILE = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo-mobile.mp4";

/**
 * Petit bouton "Aperçu vidéo" qui ouvre la vidéo promo Winelio en plein écran (modale).
 * Utilisé sur la page Réseau (section "Mon code parrain") pour que les parrains
 * puissent revoir le pitch à montrer à leurs filleuls.
 */
export function PromoVideoPreview() {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lock body scroll + autoplay on open, fermeture via Echap
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    // Lecture immédiate avec son (le clic utilisateur autorise l'audio)
    const v = videoRef.current;
    if (v) {
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Aperçu de la vidéo de présentation"
        className="inline-flex items-center gap-2 rounded-xl border border-winelio-orange/30 bg-white px-4 py-2.5 text-sm font-semibold text-winelio-orange shadow-sm transition hover:border-winelio-orange hover:bg-winelio-orange/5"
      >
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v2.25l3.22-2.25A.75.75 0 0118.5 5.13v9.74a.75.75 0 01-1.28.55L14 13.25V15.5A1.5 1.5 0 0112.5 17h-9A1.5 1.5 0 012 15.5v-11z" clipRule="evenodd" />
        </svg>
        Aperçu vidéo
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Vidéo de présentation Winelio"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-label="Fermer la vidéo"
            className="absolute top-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25"
          >
            <svg className="size-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <video
            ref={videoRef}
            controls
            playsInline
            className="block max-h-[calc(100dvh-2rem)] max-w-full rounded-2xl shadow-2xl"
            style={{ aspectRatio: "9/16" }}
            onClick={(e) => e.stopPropagation()}
          >
            <source media="(max-width: 768px)" src={VIDEO_URL_MOBILE} type="video/mp4" />
            <source src={VIDEO_URL_DESKTOP} type="video/mp4" />
          </video>
        </div>
      )}
    </>
  );
}
