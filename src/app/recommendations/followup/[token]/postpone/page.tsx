// src/app/recommendations/followup/[token]/postpone/page.tsx
// Page publique : menu intermédiaire pour reporter une relance.
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PostponePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ formattedDate: string } | null>(null);
  const [customDate, setCustomDate] = useState("");

  const handlePostpone = async (offsetMs: number, dateOverride?: string) => {
    setSubmitting(true);
    setError(null);
    const targetIso = dateOverride
      ? new Date(dateOverride).toISOString()
      : new Date(Date.now() + offsetMs).toISOString();

    const res = await fetch("/api/recommendations/followup-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        action: "postpone",
        postpone_to: targetIso,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }
    const formattedDate = new Date(targetIso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });
    setDone({ formattedDate });
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">📅</div>
          <h1 className="text-xl font-bold text-winelio-dark mb-2">Relance reportée</h1>
          <p className="text-winelio-gray mb-6">Nous reviendrons vers vous le <strong>{done.formattedDate}</strong>.</p>
          <button onClick={() => router.push("/")} className="text-winelio-orange underline text-sm">Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📅</div>
          <h1 className="text-xl font-bold text-winelio-dark">Reporter la relance</h1>
          <p className="text-sm text-winelio-gray mt-2">Choisissez quand nous devrons revenir vers vous.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => handlePostpone(48 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 48 heures
          </button>
          <button
            onClick={() => handlePostpone(7 * 24 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 1 semaine
          </button>
          <button
            onClick={() => handlePostpone(30 * 24 * 60 * 60 * 1000)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-winelio-orange/20 bg-white px-4 py-3 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5 disabled:opacity-50"
          >
            Dans 1 mois
          </button>

          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-semibold text-winelio-dark mb-2">Choisir une date précise</label>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={() => customDate && handlePostpone(0, customDate)}
              disabled={submitting || !customDate}
              className="mt-2 w-full rounded-xl bg-winelio-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Reporter à cette date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
