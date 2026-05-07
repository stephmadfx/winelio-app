"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur. Réessayez.");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("winelio_last_email", email);
      router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Erreur réseau. Réessayez.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
        <div className="my-auto w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <WinelioLogo variant="color" height={40} />
          </div>

          <section className="flex flex-col rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(45,52,54,0.12)] ring-1 ring-black/5 sm:p-8">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />

            <div className="mt-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-winelio-gray">
                  Mot de passe oublié
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-winelio-dark">
                  Réinitialiser le mot de passe
                </h2>
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  Entrez votre adresse email, nous vous enverrons un code à 6 chiffres pour
                  définir un nouveau mot de passe.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-orange/10 text-winelio-orange">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 7a4 4 0 11-8 0 4 4 0 018 0zM3 21h18M9 11l-1 4 4-1 8-8a2.828 2.828 0 10-4-4l-7 9z"
                  />
                </svg>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
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
                  autoComplete="email"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Envoi…
                  </>
                ) : (
                  "Recevoir le code"
                )}
              </button>
            </form>

            <Link
              href="/auth/login"
              className="mt-4 text-center text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
            >
              ← Retour à la connexion
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
