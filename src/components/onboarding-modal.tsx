"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function OnboardingModal({ userId }: { userId: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Prénom et nom sont obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("profiles")
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq("id", userId);

    if (dbError) {
      setError("Erreur lors de la sauvegarde. Réessayez.");
      setSaving(false);
      return;
    }

    // Envoie l'email de bienvenue (non bloquant)
    fetch("/api/email/welcome", { method: "POST" }).catch(() => {});

    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-winelio-orange to-winelio-amber px-8 py-7">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white">Bienvenue sur Winelio !</h2>
          <p className="text-white/80 text-sm mt-1">Pour commencer, présentez-vous à votre réseau.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-winelio-dark mb-1.5">
                Prénom <span className="text-winelio-orange">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-winelio-dark mb-1.5">
                Nom <span className="text-winelio-orange">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/50 focus:border-winelio-orange transition"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enregistrement...
              </span>
            ) : (
              "Continuer"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
