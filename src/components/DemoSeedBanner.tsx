"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SeedStatus = "idle" | "pending" | "ready" | "dismissed";

export function DemoSeedBanner() {
  const [status, setStatus] = useState<SeedStatus>("idle");

  // Rehydration depuis localStorage
  useEffect(() => {
    const stored = localStorage.getItem("demo_seed_status") as SeedStatus | null;
    if (stored === "dismissed") { setStatus("dismissed"); return; }
    if (stored === "ready")     { setStatus("ready"); return; }
    if (stored === "pending")   { setStatus("pending"); return; }
  }, []);

  // Polling quand pending
  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/demo/status");
        const { status: s } = await res.json();
        if (s === "ready") {
          setStatus("ready");
          localStorage.setItem("demo_seed_status", "ready");
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  function dismiss() {
    setStatus("dismissed");
    localStorage.removeItem("demo_seed_status");
  }

  if (status === "idle" || status === "dismissed") return null;

  if (status === "pending") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>
            <strong>Réseau démo en cours de création...</strong>{" "}
            Cela vous permettra de vivre l&apos;expérience complète de Winelio.
          </span>
        </div>
        <button onClick={dismiss} className="text-amber-500 hover:text-amber-700 shrink-0">✕</button>
      </div>
    );
  }

  // ready
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-orange-50 border-b border-winelio-orange/30 text-winelio-dark text-sm">
      <div className="flex items-center gap-3">
        <span className="text-base">✅</span>
        <span>
          <strong>Votre réseau démo est prêt !</strong>{" "}
          Découvrez ce que Winelio peut vous apporter.
        </span>
        <Link
          href="/network"
          className="shrink-0 font-semibold text-winelio-orange hover:text-winelio-amber underline underline-offset-2"
        >
          Voir mon réseau →
        </Link>
      </div>
      <button onClick={dismiss} className="text-winelio-gray hover:text-winelio-dark shrink-0">✕</button>
    </div>
  );
}

// Helper exporté pour déclencher le seed depuis la page profil
export function triggerDemoSeed() {
  if (typeof window === "undefined") return;
  localStorage.setItem("demo_seed_status", "pending");
  fetch("/api/demo/seed-network", { method: "POST" }).catch(() => {});
}
