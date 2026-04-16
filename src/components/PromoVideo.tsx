"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_URL = "/promo.mp4";

export function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [started, setStarted] = useState(false);

  // Autoplay muet dès que la vidéo entre dans le viewport
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          video.play().catch(() => {});
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [started]);

  // Sur mobile : au premier geste (touchstart), on attend que la vidéo
  // soit prête puis on active le son — comme un "faux clic" déclenché
  // par le navigateur grâce à la gesture capturée.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const unlockWithSound = () => {
      const doUnmute = () => {
        video.muted = false;
        setMuted(false);
        video.play().catch(() => {});
      };

      // Si la vidéo a déjà chargé assez de données, on agit immédiatement
      if (video.readyState >= 2) {
        doUnmute();
      } else {
        // Sinon on attend l'événement canplay, dans la même "gesture loop"
        video.addEventListener("canplay", doUnmute, { once: true });
      }
    };

    // Premier touchstart n'importe où sur la page → unlock son
    document.addEventListener("touchstart", unlockWithSound, {
      once: true,
      passive: true,
    });
    // Fallback desktop : premier clic
    document.addEventListener("click", unlockWithSound, { once: true });

    return () => {
      document.removeEventListener("touchstart", unlockWithSound);
      document.removeEventListener("click", unlockWithSound);
    };
  }, []);

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (video.paused) video.play().catch(() => {});
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(255,107,53,0.18)]">
      {/* Bordure accent */}
      <div className="absolute inset-0 rounded-2xl ring-1 ring-winelio-orange/20 pointer-events-none z-10" />

      <video
        ref={videoRef}
        src={VIDEO_URL}
        muted
        playsInline
        autoPlay
        className="w-full block"
        style={{ aspectRatio: "16/9" }}
        onEnded={() => {
          if (videoRef.current) videoRef.current.currentTime = 0;
        }}
      />

      {/* Overlay indicateur son — visible tant que muet */}
      {muted && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm pointer-events-none">
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" />
          </svg>
          Son
        </div>
      )}

      {/* Bouton couper le son — une fois activé */}
      {!muted && (
        <button
          onClick={toggleSound}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
          aria-label="Couper le son"
        >
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
          </svg>
          Couper le son
        </button>
      )}
    </div>
  );
}
