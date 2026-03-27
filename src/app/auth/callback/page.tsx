"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type ErrorType = "expired" | "used" | "generic";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [email, setEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    // GoTrue redirects here with ?error= when verification fails
    const error = params.get("error");
    const errorDescription = params.get("error_description") ?? "";

    if (error) {
      console.error("GoTrue error:", error, errorDescription);
      const desc = errorDescription.toLowerCase();
      if (desc.includes("expired") || desc.includes("expiré")) {
        setErrorType("expired");
      } else if (
        error === "access_denied" ||
        desc.includes("already used") ||
        desc.includes("already been used") ||
        desc.includes("invalid otp") ||
        desc.includes("otp")
      ) {
        // access_denied typically means the spam scanner already consumed the token
        setErrorType("used");
      } else {
        setErrorType("generic");
      }
      return;
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) {
          console.error("Exchange error:", err.message);
          const msg = err.message.toLowerCase();
          if (msg.includes("expired") || msg.includes("expiré")) {
            setErrorType("expired");
          } else {
            setErrorType("used");
          }
        } else {
          router.push("/dashboard");
        }
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          router.push("/dashboard");
        } else {
          setErrorType("generic");
        }
      });
    }
  }, [router]);

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setResendLoading(false);
    setResendSent(true);
  };

  if (errorType !== null) {
    const isSpamLikely = errorType === "used";
    const isExpired = errorType === "expired";

    return (
      <div className="min-h-dvh bg-kiparlo-dark flex items-center justify-center px-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-3">
            Lien invalide ou expiré
          </h2>

          <p className="text-gray-400 mb-2 text-sm leading-relaxed">
            {isSpamLikely
              ? "Ce lien a déjà été utilisé. Cela arrive souvent quand votre boîte mail analyse automatiquement les liens dans les spams — ce qui consomme le lien avant même que vous cliquiez."
              : isExpired
              ? "Ce lien de connexion a expiré. Les liens sont valables 1 heure."
              : "Ce lien de connexion n'est plus valide."}
          </p>

          <p className="text-gray-500 text-sm mb-6">
            Entrez votre email pour recevoir un nouveau lien.
          </p>

          {resendSent ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm">
              ✅ Un nouveau lien vous a été envoyé. Vérifiez votre boîte mail.
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-kiparlo-orange focus:border-transparent transition"
              />
              <button
                onClick={handleResend}
                disabled={resendLoading || !email}
                className="w-full py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendLoading ? "Envoi en cours..." : "Recevoir un nouveau lien"}
              </button>

              <a
                href="/auth/login"
                className="block text-sm text-gray-500 hover:text-gray-300 transition-colors mt-2"
              >
                Retour à la page de connexion
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="min-h-dvh bg-kiparlo-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-kiparlo-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Connexion en cours...</p>
      </div>
    </div>
  );
}
