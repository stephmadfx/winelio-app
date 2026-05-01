"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_URL = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo.mp4";
export const PROMO_WATCHED_KEY = "winelio_promo_watched";
export const PROMO_UNLOCK_RATIO = 0.5;

type Props = {
  /** Notifie en continu le temps restant (en secondes) avant déblocage. 0 = déblocage atteint. */
  onCountdownChange?: (secondsLeft: number) => void;
  /** Tiré une seule fois au moment où le seuil est franchi. */
  onUnlock?: () => void;
};

export function PromoVideo({ onCountdownChange, onUnlock }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const unlockedRef = useRef(false);

  // Si déjà débloquée précédemment, on prévient le parent dès le mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PROMO_WATCHED_KEY) === "1") {
      unlockedRef.current = true;
      onCountdownChange?.(0);
      onUnlock?.();
    }
  }, [onCountdownChange, onUnlock]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.muted = false;
          video.play().catch(() => {
            video.muted = true;
            setMuted(true);
            video.play().catch(() => {});
          });
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // Tracking du déblocage à PROMO_UNLOCK_RATIO du temps cumulé
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleProgress = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) return;
      const target = duration * PROMO_UNLOCK_RATIO;
      const remaining = Math.max(0, Math.ceil(target - video.currentTime));
      onCountdownChange?.(remaining);
      if (!unlockedRef.current && video.currentTime >= target) {
        unlockedRef.current = true;
        try {
          window.localStorage.setItem(PROMO_WATCHED_KEY, "1");
        } catch {}
        onUnlock?.();
      }
    };

    video.addEventListener("loadedmetadata", handleProgress);
    video.addEventListener("timeupdate", handleProgress);
    video.addEventListener("durationchange", handleProgress);
    return () => {
      video.removeEventListener("loadedmetadata", handleProgress);
      video.removeEventListener("timeupdate", handleProgress);
      video.removeEventListener("durationchange", handleProgress);
    };
  }, [onCountdownChange, onUnlock]);

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (video.paused && !ended) video.play().catch(() => {});
  }

  function replay() {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    video.currentTime = 0;
    video.muted = muted;
    video.play().catch(() => {});
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(255,107,53,0.18)]">
      <div className="absolute inset-0 rounded-2xl ring-1 ring-winelio-orange/20 pointer-events-none z-10" />

      <video
        ref={videoRef}
        src={VIDEO_URL}
        playsInline
        className="w-full block"
        style={{ aspectRatio: "16/9" }}
        onEnded={() => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = video.duration - 0.5;
          video.pause();
          setEnded(true);
        }}
      />

      {ended && (
        <button
          onClick={replay}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80"
          aria-label="Rejouer"
        >
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Rejouer
        </button>
      )}

      <button
        onClick={toggleSound}
        className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
        aria-label={muted ? "Activer le son" : "Couper le son"}
      >
        {muted ? (
          <>
            <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" />
            </svg>
            Son
          </>
        ) : (
          <>
            <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
            Couper le son
          </>
        )}
      </button>
    </div>
  );
}
