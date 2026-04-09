"use client";

import { useState } from "react";
import { AppBackground } from "@/components/AppBackground";

export default function Home() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'envoi.");
        return;
      }

      sessionStorage.setItem("winelio_last_email", email);
      window.location.assign(`/auth/login?step=code&email=${encodeURIComponent(email)}`);
    } catch {
      setError("Impossible d'envoyer le code pour le moment. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-6 sm:px-6 lg:px-8">
        <section className="w-full rounded-[30px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(45,52,54,0.12)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-winelio-orange">
              Connexion
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-winelio-dark sm:text-3xl">
              Recevoir un code
            </h1>
            <p className="mt-3 text-sm leading-6 text-winelio-gray sm:text-base">
              Saisissez votre adresse email pour recevoir un code de connexion.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-left">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-winelio-dark">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Envoi en cours..." : "Se connecter"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
