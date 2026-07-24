"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReferralLinkRenewalForm } from "@/components/referral-link-renewal-form";

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
    const needsPasswordSetup = searchParams.get("setup_password") === "1";

    if (!tokenHash) {
      setError("Jeton de validation manquant.");
      setVerifying(false);
      return;
    }

    fetch("/api/auth/confirm-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenHash, type }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Validation impossible.");

        try {
          localStorage.setItem("winelio_known_user", "1");
        } catch {}

        const redirectTo = needsPasswordSetup || result.requiresPasswordSetup
          ? "/auth/create-password"
          : "/dashboard";
        router.replace(redirectTo);
        router.refresh();
      })
      .catch((verificationError) => {
        setError(verificationError instanceof Error ? verificationError.message : "Validation impossible.");
        setVerifying(false);
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

        <ReferralLinkRenewalForm dark />

        <a
          href="/auth/login"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Retourner à la connexion
        </a>
      </div>
    </div>
  );
}
