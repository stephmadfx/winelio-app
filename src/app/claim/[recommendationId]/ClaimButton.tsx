"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClaimButton({ recommendationId }: { recommendationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claim/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || "Erreur lors de la revendication");
        setLoading(false);
        return;
      }
      router.push(`/recommendations/${recommendationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="block w-full rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-4 text-center text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer"
      >
        {loading ? "Revendication en cours…" : "Revendiquer ma fiche et accéder au lead →"}
      </button>
      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}
