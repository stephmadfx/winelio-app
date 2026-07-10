"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PromoVideo } from "@/components/PromoVideo";

export const KNOWN_USER_KEY = "winelio_known_user";

export function LandingHero() {
  const [unlocked, setUnlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [knownUser, setKnownUser] = useState(false);

  // Code parrain transmis via ?ref=... (ex : QR code). On le persiste en localStorage
  // pour que /auth/login puisse l'utiliser même si le param n'est pas propagé dans l'URL,
  // et on l'ajoute explicitement dans le lien d'inscription.
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
  useEffect(() => {
    if (refCode) {
      try {
        localStorage.setItem("winelio_ref", refCode);
      } catch {}
    }
  }, [refCode]);

  // Détecte un visiteur déjà connecté par le passé (session expirée ou logout) :
  // on lui pré-débloque l'inscription et on met "Se connecter" en avant.
  useEffect(() => {
    try {
      if (localStorage.getItem(KNOWN_USER_KEY) === "1") {
        setKnownUser(true);
        setUnlocked(true);
      }
    } catch {}
  }, []);

  const handleCountdown = useCallback((s: number) => {
    setSecondsLeft(s);
    if (s <= 0) setUnlocked(true);
  }, []);
  const handleUnlock = useCallback(() => setUnlocked(true), []);

  const typeParam = searchParams.get("type");
  const registerHref = refCode
    ? `/auth/login?mode=register&ref=${encodeURIComponent(refCode)}${typeParam ? `&type=${encodeURIComponent(typeParam)}` : ""}`
    : `/auth/login?mode=register${typeParam ? `&type=${encodeURIComponent(typeParam)}` : ""}`;

  const primaryClass =
    "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105";
  const secondaryClass =
    "inline-flex items-center justify-center rounded-2xl border border-winelio-orange/30 bg-white px-6 py-3.5 text-sm font-semibold text-winelio-orange transition hover:border-winelio-orange hover:bg-winelio-orange/5";
  const disabledClass =
    "inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-6 py-3.5 text-sm font-semibold text-gray-400 cursor-not-allowed";

  // CTA principal/secondaire selon le profil du visiteur :
  // - Utilisateur connu (déjà inscrit) → Se connecter en primaire
  // - Visiteur via lien parrain → Créer un compte en primaire (pas de Se connecter)
  // - Nouveau visiteur → Créer un compte en primaire (gated), Se connecter en secondaire
  const showLoginButton = !refCode;

  const registerButton = unlocked ? (
    <Link href={registerHref} className={knownUser ? secondaryClass : primaryClass}>
      Créer un compte
    </Link>
  ) : (
    <button type="button" disabled aria-disabled="true" className={disabledClass}>
      Créer un compte
    </button>
  );

  const loginButton = showLoginButton ? (
    <Link href="/auth/login" className={knownUser ? primaryClass : secondaryClass}>
      Se connecter
    </Link>
  ) : null;

  return (
    <>
      <div className="mt-6">
        <PromoVideo onCountdownChange={handleCountdown} onUnlock={handleUnlock} compact={unlocked} />
      </div>

      {/* Décompte / état de déblocage — masqué pour les utilisateurs déjà connus */}
      {!knownUser && (
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
      )}

      <div className={`flex flex-col gap-3 ${knownUser ? "mt-6" : "mt-4"}`}>
        {/* Pour un visiteur connu : Se connecter d'abord (CTA principal).
            Pour un nouveau visiteur : Créer un compte juste sous la vidéo. */}
        {knownUser ? (
          <>
            {loginButton}
            {registerButton}
          </>
        ) : (
          <>
            {registerButton}
            {loginButton}
          </>
        )}
      </div>
    </>
  );
}
