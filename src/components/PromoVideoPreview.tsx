"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIDEO_URL_DESKTOP = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo.mp4";
const VIDEO_URL_MOBILE = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo-mobile.mp4";

/**
 * Petit bouton "Aperçu vidéo" qui ouvre la vidéo promo Winelio en plein écran (modale).
 * Utilisé sur la page Réseau (section "Mon code parrain") pour que les parrains
 * puissent revoir le pitch à montrer à leurs filleuls.
 */
export function PromoVideoPreview() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setMounted(true), []);

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
        className="group relative h-full w-[110px] shrink-0 overflow-hidden rounded-xl border-2 border-winelio-orange/40 bg-winelio-light shadow-md transition hover:border-winelio-orange hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-winelio-orange"
        style={{ aspectRatio: "9/16", minHeight: 180 }}
      >
        <img
          src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo-thumb.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-black/60 via-black/20 to-black/30 transition group-hover:from-black/40 group-hover:to-black/10">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-winelio-orange shadow-xl ring-2 ring-white/40 transition group-hover:scale-110">
            <svg className="size-5 ml-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6 4l10 6-10 6V4z" />
            </svg>
          </span>
          <span className="absolute bottom-2 left-2 right-2 text-center text-[10px] font-semibold uppercase tracking-wider text-white drop-shadow-md">
            Voir la vidéo
          </span>
        </span>
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-2 sm:p-4"
          style={{ zIndex: 2147483647 }}
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
            className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30"
            style={{ zIndex: 2147483647 }}
          >
            <svg className="size-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          <video
            ref={videoRef}
            controls
            playsInline
            className="block h-[90dvh] max-h-[90dvh] w-auto max-w-[90vw] rounded-2xl shadow-2xl"
            style={{ aspectRatio: "9/16" }}
            onClick={(e) => e.stopPropagation()}
          >
            <source media="(max-width: 768px)" src={VIDEO_URL_MOBILE} type="video/mp4" />
            <source src={VIDEO_URL_DESKTOP} type="video/mp4" />
          </video>
        </div>,
        document.body
      )}
    </>
  );
}
