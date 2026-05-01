"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PromoVideo } from "@/components/PromoVideo";

export function LandingHero() {
  const [unlocked, setUnlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const handleCountdown = useCallback((s: number) => {
    setSecondsLeft(s);
    if (s <= 0) setUnlocked(true);
  }, []);
  const handleUnlock = useCallback(() => setUnlocked(true), []);

  return (
    <>
      <div className="mt-6">
        <PromoVideo onCountdownChange={handleCountdown} onUnlock={handleUnlock} />
      </div>

      {/* Décompte / état de déblocage */}
      <div className="mt-4 min-h-[44px] flex items-center justify-center">
        {unlocked ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-200">
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Inscription débloquée
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-full bg-winelio-orange/10 px-4 py-2 text-xs font-semibold text-winelio-orange ring-1 ring-winelio-orange/20">
            <svg className="size-3.5 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06l-2.78-2.78V5z" clipRule="evenodd" />
            </svg>
            {secondsLeft === null
              ? "Regarde la vidéo pour continuer"
              : `Encore ${secondsLeft}s avant de pouvoir t'inscrire`}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105"
        >
          Se connecter
        </Link>
        {unlocked ? (
          <Link
            href="/auth/login?mode=register"
            className="inline-flex items-center justify-center rounded-2xl border border-winelio-orange/30 bg-white px-6 py-3.5 text-sm font-semibold text-winelio-orange transition hover:border-winelio-orange hover:bg-winelio-orange/5"
          >
            Créer un compte
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-6 py-3.5 text-sm font-semibold text-gray-400 cursor-not-allowed"
          >
            Créer un compte
          </button>
        )}
      </div>
    </>
  );
}
