"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-winelio-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-winelio-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Chargement...</p>
        </div>
      </div>
    }>
      <ConfirmHandler />
    </Suspense>
  );
}

function ConfirmHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") || "signup";

    if (!tokenHash) {
      setError("Jeton de validation manquant.");
      setVerifying(false);
      return;
    }

    const supabase = createClient();
    
    // Toujours appeler verifyOtp pour confirmer l'email,
    // même si une session est déjà active (test en étant connecté avec un autre compte).
    supabase.auth
      .verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          console.error("Verification error:", verifyError.message);

          // Si le jeton est déjà utilisé/expiré, vérifier si une session est quand même active
          // (cas où l'utilisateur a déjà cliqué le lien une fois et revient dessus)
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              try {
                localStorage.setItem("winelio_known_user", "1");
              } catch {}
              router.push("/dashboard");
              return;
            }

            let msg = verifyError.message;
            if (
              msg.toLowerCase().includes("invalid or has expired") ||
              msg.toLowerCase().includes("expired")
            ) {
              msg = "Ce lien de validation a déjà été utilisé ou a expiré. Si vous vous êtes déjà inscrit, votre compte est actif et vous pouvez vous connecter directement.";
            }
            setError(msg);
            setVerifying(false);
          });
        } else {
          try {
            localStorage.setItem("winelio_known_user", "1");
          } catch {}
          router.push("/dashboard");
        }
      });
  }, [router, searchParams]);

  if (verifying) {
    return (
      <div className="min-h-dvh bg-winelio-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-winelio-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Validation de votre compte en cours...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-winelio-dark flex items-center justify-center px-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-3">
          Validation du compte
        </h2>

        <p className="text-gray-400 mb-6 text-sm leading-relaxed">
          {error || "Ce lien de validation est invalide ou a expiré."}
        </p>

        <a
          href="/auth/login"
          className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Retourner à la connexion
        </a>
      </div>
    </div>
  );
}
