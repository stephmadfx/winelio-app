"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();

    // PKCE flow: exchange code for session
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
        if (err) {
          console.error("Auth error:", err.message);
          setError("Une erreur est survenue lors de la connexion.");
        } else {
          router.push("/dashboard");
        }
      });
    } else {
      // Check if already authenticated
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          router.push("/dashboard");
        } else {
          setError("Lien de connexion invalide ou expiré.");
        }
      });
    }
  }, [router]);

  if (error) {
    return (
      <div className="min-h-dvh bg-kiparlo-dark flex items-center justify-center px-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-3">Erreur de connexion</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <a href="/auth/login" className="px-6 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl inline-block">
            Réessayer
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-kiparlo-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-kiparlo-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Connexion en cours...</p>
      </div>
    </div>
  );
}
