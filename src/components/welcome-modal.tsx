"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";

const REDIRECT_DELAY_S = 4;

export function WelcomeModal({
  firstName,
  onClose,
}: {
  firstName?: string | null;
  onClose: () => void;
}) {
  const fired = useRef(false);
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_S);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Confettis 🎉
    const colors = ["#FF6B35", "#F7931E", "#FFD166", "#06D6A0", "#118AB2"];
    const fire = (particleRatio: number, opts: confetti.Options) => {
      confetti({
        origin: { y: 0.6 },
        colors,
        particleCount: Math.floor(220 * particleRatio),
        ...opts,
      });
    };
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });

    // Compte à rebours puis redirection auto vers le dashboard
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          router.push("/dashboard");
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [router]);

  // Pause le compte à rebours si l'utilisateur survole le bloc "Espace pro"
  // (lui laisser le temps de cliquer sans être redirigé en plein milieu).
  const handlePause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const handleResume = () => {
    pausedRef.current = false;
    setPaused(false);
  };

  const goNow = () => {
    router.push("/dashboard");
  };

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center animate-in zoom-in-95 fade-in duration-300">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center mb-5 shadow-lg shadow-winelio-orange/30">
          <span className="text-4xl" role="img" aria-label="confettis">🎉</span>
        </div>

        <h2 className="text-2xl font-bold text-winelio-dark mb-2">
          Merci{firstName ? `, ${firstName}` : ""} !
        </h2>
        <p className="text-sm text-winelio-gray leading-relaxed mb-6">
          Votre profil est complet. Direction votre tableau de bord pour découvrir Winelio.
        </p>

        <button
          type="button"
          onClick={goNow}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold text-sm shadow-md hover:opacity-90 transition-opacity"
        >
          Accéder à mon tableau de bord
          {!paused && secondsLeft > 0 ? ` (${secondsLeft}s) →` : " →"}
        </button>

        <div
          className="mt-5 w-full rounded-2xl border border-winelio-orange/20 bg-winelio-orange/5 p-4 text-left"
          onMouseEnter={handlePause}
          onMouseLeave={handleResume}
          onFocus={handlePause}
          onBlur={handleResume}
        >
          <p className="text-xs font-semibold text-winelio-dark mb-1">
            Vous êtes professionnel ?
          </p>
          <p className="text-xs text-winelio-gray leading-relaxed mb-3">
            Activez votre espace pro pour recevoir des recommandations qualifiées et créer votre fiche entreprise.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/profile/pro-onboarding");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-winelio-orange hover:text-winelio-amber transition-colors"
          >
            Activer mon espace pro →
          </button>
        </div>
      </div>
    </div>
  );
}
