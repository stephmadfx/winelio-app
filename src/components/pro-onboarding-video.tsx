"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, RotateCcw, X } from "lucide-react";

export const PRO_ONBOARDING_VIDEO_SRC = "/videos/pro-onboarding.mp4";

export function ProOnboardingVideoPlayer({
  autoPlay = false,
  className = "",
  onEnded,
}: {
  autoPlay?: boolean;
  className?: string;
  onEnded?: () => void;
}) {
  return (
    <video
      className={`mx-auto aspect-[9/16] max-h-[76dvh] w-full max-w-[420px] rounded-2xl bg-winelio-dark object-contain shadow-2xl ${className}`}
      src={PRO_ONBOARDING_VIDEO_SRC}
      controls
      playsInline
      autoPlay={autoPlay}
      onEnded={onEnded}
      preload="metadata"
    />
  );
}

export function ProOnboardingVideoReplayButton({
  label = "Revoir la vidéo pro",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const replay = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch(() => {});
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-winelio-orange/25 bg-white px-4 py-2.5 text-sm font-semibold text-winelio-orange shadow-sm transition hover:bg-orange-50 ${className}`}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-winelio-dark/85 p-3 backdrop-blur-sm sm:p-4">
          <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[min(92vw,420px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-winelio-dark shadow-lg ring-1 ring-black/10 transition hover:bg-winelio-light sm:right-4 sm:top-4"
              aria-label="Fermer la vidéo"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-winelio-dark p-2 sm:p-3">
              <video
                ref={videoRef}
                className="aspect-[9/16] max-h-[calc(100dvh-11rem)] w-full max-w-[420px] rounded-xl bg-winelio-dark object-contain sm:max-h-[76dvh] sm:rounded-2xl"
                src={PRO_ONBOARDING_VIDEO_SRC}
                controls
                playsInline
                autoPlay
              />
            </div>
            <div className="shrink-0 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
              <div>
                <h3 className="text-base font-bold text-winelio-dark">Parcours professionnel Winelio</h3>
                <p className="text-sm text-winelio-gray">Une vidéo courte pour revoir les avantages et les étapes.</p>
              </div>
              <button
                type="button"
                onClick={replay}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-winelio-light px-4 py-2.5 text-sm font-semibold text-winelio-dark transition hover:bg-orange-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Rejouer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
