"use client";

import { useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

      {open && (
        <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-winelio-dark/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-winelio-dark shadow-lg transition hover:bg-white"
              aria-label="Fermer la vidéo"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="bg-winelio-dark p-3">
              <video
                ref={videoRef}
                className="mx-auto aspect-[9/16] max-h-[76dvh] w-full max-w-[420px] rounded-2xl bg-winelio-dark object-contain"
                src={PRO_ONBOARDING_VIDEO_SRC}
                controls
                playsInline
                autoPlay
              />
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      )}
    </>
  );
}
