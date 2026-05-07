"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WinelioLogo } from "@/components/winelio-logo";
import { AppBackground } from "@/components/AppBackground";

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const prefilled = searchParams.get("email");
    if (prefilled) setEmail(prefilled);
    else {
      const saved = sessionStorage.getItem("winelio_last_email");
      if (saved) setEmail(saved);
    }
  }, [searchParams]);

  const handleResend = async () => {
    if (!email) return;
    setError("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Impossible de renvoyer le code.");
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur. Réessayez.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/auth/login?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch {
      setError("Erreur réseau. Réessayez.");
      setLoading(false);
    }
  };

  return (
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
                Étape 2 sur 2
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-winelio-dark">
                Nouveau mot de passe
              </h2>
              <p className="mt-2 text-sm leading-6 text-winelio-gray">
                Saisissez le code reçu à <span className="font-semibold text-winelio-dark">{email || "votre email"}</span>
                {" "}et choisissez un nouveau mot de passe.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-orange/10 text-winelio-orange">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>

          {success ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-700">
              <p className="font-semibold">Mot de passe mis à jour ✓</p>
              <p className="mt-1">Redirection vers la page de connexion…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {!searchParams.get("email") && (
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
              )}

              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium text-winelio-dark">
                  Code à 6 chiffres
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  required
                  autoComplete="one-time-code"
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-center text-2xl font-semibold tracking-[0.5em] text-winelio-dark placeholder:text-winelio-gray/40 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-winelio-dark">
                  Nouveau mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
                <p className="text-xs text-winelio-gray">8 caractères minimum.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-winelio-dark">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
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
                    Mise à jour…
                  </>
                ) : (
                  "Définir le mot de passe"
                )}
              </button>

              <div className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href="/auth/forgot-password"
                  className="font-medium text-winelio-gray transition hover:text-winelio-orange"
                >
                  ← Changer d&apos;email
                </Link>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || !email}
                  className="font-medium text-winelio-orange transition hover:text-winelio-amber disabled:opacity-50"
                >
                  {resending ? "Envoi…" : "Renvoyer le code"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
