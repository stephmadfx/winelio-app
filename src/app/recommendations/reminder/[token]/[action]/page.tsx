// Page publique de confirmation (annuler la reco / ne plus recevoir les rappels).
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

const COPY = {
  cancel: {
    title: "Annuler cette recommandation ?",
    text: "Le recommandeur sera prévenu que vous ne donnez pas suite.",
    button: "Annuler la recommandation",
    done: "La recommandation est annulée. Le recommandeur a été prévenu.",
  },
  unsubscribe: {
    title: "Ne plus recevoir ces rappels ?",
    text: "Vous ne recevrez plus d'email de rappel pour les recommandations sans réponse. Vos autres notifications ne changent pas.",
    button: "Me désinscrire des rappels",
    done: "C'est noté, vous ne recevrez plus ces rappels.",
  },
} as const;

export default function ReminderActionPage() {
  const { token, action } = useParams<{ token: string; action: string }>();
  const copy = action === "cancel" || action === "unsubscribe" ? COPY[action] : null;
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!copy) return null;

  const submit = async () => {
    setState("busy");
    setError(null);
    const res = await fetch("/api/recommendations/reminder-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Erreur");
      setState("idle");
      return;
    }
    setState("done");
  };

  return (
    <div className="min-h-screen bg-[#F0F2F4] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
        {state === "done" ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <p className="text-winelio-gray mb-6">{copy.done}</p>
            <a href="/" className="text-winelio-orange underline text-sm">Découvrir Winelio</a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-winelio-dark mb-2">{copy.title}</h1>
            <p className="text-winelio-gray mb-6 text-sm leading-relaxed">{copy.text}</p>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
            )}
            <button
              onClick={submit}
              disabled={state === "busy"}
              className="w-full rounded-xl bg-winelio-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {state === "busy" ? "..." : copy.button}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
