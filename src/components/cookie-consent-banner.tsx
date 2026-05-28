"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const CONSENT_KEY = "winelio_cookie_consent";

type CookieConsentValue = "accepted" | "declined";

export function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const isProtectedApp =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/profile") ||
    pathname?.startsWith("/companies") ||
    pathname?.startsWith("/recommendations") ||
    pathname?.startsWith("/network") ||
    pathname?.startsWith("/wallet") ||
    pathname?.startsWith("/settings") ||
    pathname?.startsWith("/gestion-reseau");

  useEffect(() => {
    try {
      setVisible(!localStorage.getItem(CONSENT_KEY));
    } catch {
      setVisible(false);
    }
  }, []);

  function saveConsent(value: CookieConsentValue) {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({
          value,
          date: new Date().toISOString(),
          version: 1,
        })
      );
    } catch {}

    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section
      role="region"
      aria-label="Gestion des cookies"
      className={cn(
        "fixed left-3 right-3 z-[9998] mx-auto max-w-5xl rounded-2xl border border-white/70 bg-white/95 p-3 text-winelio-dark shadow-[0_18px_60px_rgba(45,52,54,0.18)] backdrop-blur-xl sm:left-4 sm:right-4 sm:p-4 dark:border-white/10 dark:bg-slate-950/95 dark:text-white",
        isProtectedApp ? "bottom-24 lg:bottom-5" : "bottom-4"
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-winelio-orange/10 text-winelio-orange ring-1 ring-winelio-orange/20">
            <Cookie className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold">Cookies et confidentialité</h2>
            <p className="mt-1 text-xs leading-5 text-winelio-gray dark:text-slate-300 sm:text-sm">
              Winelio utilise des cookies nécessaires pour sécuriser la connexion et faire fonctionner l&apos;application.
              Les préférences locales servent aussi à mémoriser votre parcours, comme le parrainage ou la vidéo d&apos;accueil.
            </p>
            <Link
              href="/conditions-generales-utilisation"
              className="mt-1 inline-flex text-xs font-semibold text-winelio-orange underline-offset-4 hover:underline"
            >
              En savoir plus
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:items-center">
          <button
            type="button"
            onClick={() => saveConsent("declined")}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-winelio-gray transition hover:border-winelio-orange/40 hover:text-winelio-dark dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-white"
          >
            Continuer sans accepter
          </button>
          <button
            type="button"
            onClick={() => saveConsent("accepted")}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,107,53,0.22)] transition hover:brightness-105"
          >
            Accepter
          </button>
          <button
            type="button"
            aria-label="Fermer le bandeau cookies"
            onClick={() => saveConsent("declined")}
            className="hidden size-10 items-center justify-center rounded-xl text-winelio-gray transition hover:bg-gray-100 hover:text-winelio-dark md:inline-flex dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
