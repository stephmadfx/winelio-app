"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClaimButton({ recommendationId, companies }: { recommendationId: string; companies: { id: string; name: string | null }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claim/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId, companyId }),
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
      <label className="mb-3 block text-sm text-winelio-dark">Votre fiche professionnelle
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="mt-2 block w-full rounded-xl border p-3">
          {companies.map(company => <option key={company.id} value={company.id}>{company.name || "Mon entreprise"}</option>)}
        </select>
      </label>
      <button
        onClick={handleClaim}
        disabled={loading || !companyId}
        className="block w-full rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-4 text-center text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer"
      >
        {loading ? "Revendication en cours…" : "Récupérer ma recommandation →"}
      </button>
      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </>
  );
}
