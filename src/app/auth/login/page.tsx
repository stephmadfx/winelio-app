"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = searchParams.get("mode") === "register";

  // Step 1 : envoyer le code OTP par email
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setStep("code");
    setLoading(false);
  };

  // Step 2 : vérifier le code 6 chiffres
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (verifyError) {
      setError("Code invalide ou expiré. Vérifiez le code ou demandez-en un nouveau.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  // ─── UI : saisie email ───────────────────────────────────────────────────────
  if (step === "email") {
    return (
      <div className="min-h-screen bg-kiparlo-dark flex items-center justify-center px-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              <span className="text-white">KI</span>
              <span className="bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent">
                PAR
              </span>
              <span className="text-white">LO</span>
            </h1>
            <p className="text-kiparlo-gray text-sm tracking-widest uppercase">
              {isRegister ? "Créer un compte" : "Se connecter"}
            </p>
          </div>

          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-kiparlo-orange focus:border-transparent transition"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Envoi en cours...
                </span>
              ) : (
                "Recevoir le code de connexion"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() =>
                router.push(
                  isRegister ? "/auth/login" : "/auth/login?mode=register"
                )
              }
              className="text-kiparlo-gray hover:text-kiparlo-orange text-sm transition-colors"
            >
              {isRegister
                ? "Déjà un compte ? Se connecter"
                : "Pas de compte ? Créer un compte"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── UI : saisie du code 6 chiffres ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-kiparlo-dark flex items-center justify-center px-4">
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Vérifiez votre email
          </h2>
          <p className="text-gray-400 text-sm">
            Un code à 6 chiffres a été envoyé à{" "}
            <span className="text-kiparlo-orange font-medium">{email}</span>.
            <br />
            Entrez-le ci-dessous pour vous connecter.
          </p>
        </div>

        <form onSubmit={handleVerifyCode} className="space-y-5">
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Code à 6 chiffres
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              required
              autoFocus
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl tracking-widest placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-kiparlo-orange focus:border-transparent transition"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Vérification...
              </span>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
            className="block w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Utiliser une autre adresse email
          </button>
          <button
            onClick={handleSendCode}
            disabled={loading}
            className="block w-full text-sm text-kiparlo-orange hover:underline transition-colors disabled:opacity-50"
          >
            Renvoyer le code
          </button>
        </div>
      </div>
    </div>
  );
}
