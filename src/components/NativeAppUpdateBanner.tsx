"use client";

import { useEffect, useState } from "react";
import {
  APP_STORE_URL,
  LATEST_MOBILE_APP_VERSION,
  PLAY_STORE_URL,
} from "@/lib/referral-install";

const DISMISS_KEY = `winelio_app_update_dismissed_${LATEST_MOBILE_APP_VERSION}`;

function isOlderVersion(current: string, latest: string): boolean {
  const a = current.split(".").map((n) => parseInt(n, 10) || 0);
  const b = latest.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

export function NativeAppUpdateBanner() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    const check = () => {
      const native = window.__WINELIO_NATIVE_APP__;
      if (!native) return;

      try {
        if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
      } catch {
        /* ignore storage errors */
      }

      const missingPushBridge = typeof window.__WINELIO_REQUEST_PUSH_TOKEN__ !== "function";
      const outdatedVersion =
        typeof native.version === "string" &&
        native.version.length > 0 &&
        isOlderVersion(native.version, LATEST_MOBILE_APP_VERSION);

      if (missingPushBridge || outdatedVersion) {
        setPlatform(native.platform);
      }
    };

    check();
    window.addEventListener("winelio:native-ready", check);
    return () => window.removeEventListener("winelio:native-ready", check);
  }, []);

  if (!platform) return null;

  const storeUrl = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const storeLabel = platform === "ios" ? "l’App Store" : "Google Play";

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setPlatform(null);
  }

  return (
    <div
      role="region"
      aria-label="Mise à jour de l’application disponible"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-winelio-orange/30 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 shadow-sm dark:border-winelio-orange/40 dark:from-slate-800 dark:to-slate-800"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-winelio-dark dark:text-white">
          Mise à jour disponible (v{LATEST_MOBILE_APP_VERSION})
        </p>
        <p className="mt-0.5 text-xs text-winelio-gray dark:text-slate-300">
          Mettez à jour Winelio sur {storeLabel} pour activer les notifications natives.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={storeUrl}
          className="rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Mettre à jour
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fermer l’alerte de mise à jour"
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-winelio-gray hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
