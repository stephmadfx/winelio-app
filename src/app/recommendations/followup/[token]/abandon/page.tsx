// src/app/recommendations/followup/[token]/abandon/page.tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AbandonPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAbandon = async () => {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/recommendations/followup-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, action: "abandon" }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">👋</div>
          <h1 className="text-xl font-bold text-winelio-dark mb-2">Vu, merci</h1>
          <p className="text-winelio-gray mb-6">La recommandation a été marquée comme abandonnée. Le client sera prévenu.</p>
          <button onClick={() => router.push("/")} className="text-winelio-orange underline text-sm">Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-winelio-dark mb-2">Confirmer l&apos;abandon</h1>
        <p className="text-winelio-gray mb-6 text-sm leading-relaxed">
          Vous êtes sur le point d&apos;indiquer que vous ne pouvez pas donner suite à cette recommandation.
          Cette action est définitive et le client sera prévenu.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            disabled={submitting}
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-semibold text-winelio-dark"
          >
            Annuler
          </button>
          <button
            onClick={handleAbandon}
            disabled={submitting}
            className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
