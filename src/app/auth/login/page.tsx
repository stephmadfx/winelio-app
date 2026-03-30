"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NetworkBackground } from "@/components/NetworkBackground";
type SupabaseClient = ReturnType<typeof createClient>;

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-kiparlo-dark overflow-hidden">
      <NetworkBackground />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [sponsorInput, setSponsorInput] = useState("");
  const [sponsorError, setSponsorError] = useState("");
  const [sponsorChecking, setSponsorChecking] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegister = searchParams.get("mode") === "register";
  const refCode = searchParams.get("ref");

  // Stocker le code de parrainage et récupérer le nom du parrain
  useEffect(() => {
    if (!refCode) return;
    localStorage.setItem("kiparlo_ref", refCode);

    // Nom déjà dans l'URL (passé par handleSponsorCodeSubmit) ?
    const nameFromUrl = searchParams.get("sponsor_name");
    if (nameFromUrl) {
      setSponsorName(decodeURIComponent(nameFromUrl));
      return;
    }

    // Fetch le nom du parrain (sans auth, profils publics)
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("sponsor_code", refCode)
        .single()
        .then(({ data }) => {
          if (!data) return;
          const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
          setSponsorName(name || data.email || null);
        });
    });
  }, [refCode, searchParams]);

  // Appliquer le parrainage après connexion réussie
  const applyReferral = async (supabase: SupabaseClient) => {
    const storedRef = localStorage.getItem("kiparlo_ref");
    if (!storedRef) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Vérifier que le nouveau user n'a pas déjà un sponsor
    const { data: profile } = await supabase
      .from("profiles")
      .select("sponsor_id")
      .eq("id", user.id)
      .single();

    if (profile?.sponsor_id) {
      localStorage.removeItem("kiparlo_ref");
      return;
    }

    // Trouver le parrain via son sponsor_code
    const { data: sponsor } = await supabase
      .from("profiles")
      .select("id")
      .eq("sponsor_code", storedRef)
      .neq("id", user.id) // Ne pas se parrainer soi-même
      .single();

    if (!sponsor) {
      localStorage.removeItem("kiparlo_ref");
      return;
    }

    // Assigner le parrain
    await supabase
      .from("profiles")
      .update({ sponsor_id: sponsor.id })
      .eq("id", user.id);

    localStorage.removeItem("kiparlo_ref");
  };

  // Step 1: demander le code via notre API (pas GoTrue)
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Erreur lors de l'envoi.");
      setLoading(false);
      return;
    }

    setStep("code");
    setLoading(false);
  };

  // Valider un code parrain saisi manuellement
  const handleSponsorCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sponsorInput.trim().toLowerCase();
    if (!trimmed) {
      setSponsorError("Veuillez saisir un code parrain.");
      return;
    }
    setSponsorChecking(true);
    setSponsorError("");
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("sponsor_code, first_name, last_name, email")
      .eq("sponsor_code", trimmed)
      .single();
    setSponsorChecking(false);
    if (!data) {
      setSponsorError("Code parrain invalide. Demandez le code à votre parrain.");
      return;
    }
    localStorage.setItem("kiparlo_ref", trimmed);
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.email || "";
    setSponsorName(name || null);
    const nameParam = name ? `&sponsor_name=${encodeURIComponent(name)}` : "";
    router.replace(`/auth/login?mode=register&ref=${trimmed}${nameParam}`);
  };

  // Step 2: vérifier le code et créer la session
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Code invalide.");
      setLoading(false);
      return;
    }

    // Cas 1 : le serveur a extrait les tokens directement → setSession côté client
    if (data.access_token) {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
      });
      if (sessionError) {
        setError("Erreur lors de la connexion. Réessayez.");
        setLoading(false);
        return;
      }
      await applyReferral(supabase);
      router.push("/dashboard");
      return;
    }

    // Cas 2 : fallback → redirect vers action_link GoTrue
    if (data.action_link) {
      window.location.href = data.action_link;
      return;
    }

    setError("Erreur inattendue. Réessayez.");
    setLoading(false);
  };

  // ─── UI : saisie email ────────────────────────────────────────────────────
  // ─── Blocage inscription sans parrain ────────────────────────────────────
  if (isRegister && !refCode) {
    return (
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              <span className="text-white">KI</span>
              <span className="bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent">PAR</span>
              <span className="text-white">LO</span>
            </h1>
            <div className="mt-4 flex items-center justify-center w-14 h-14 rounded-full bg-kiparlo-orange/20 mx-auto mb-3">
              <svg className="w-7 h-7 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-white font-semibold text-lg">Inscription sur invitation</p>
            <p className="text-kiparlo-gray text-sm mt-2">
              Kiparlo est un réseau fermé. Pour créer un compte, vous devez disposer du code parrain d&apos;un membre du réseau.
            </p>
          </div>

          <form onSubmit={handleSponsorCodeSubmit} className="space-y-5">
            <div>
              <label htmlFor="sponsor" className="block text-sm font-medium text-gray-300 mb-2">
                Code parrain <span className="text-kiparlo-orange">*</span>
              </label>
              <input
                id="sponsor"
                type="text"
                value={sponsorInput}
                onChange={(e) => setSponsorInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="ex : 4bd0e7"
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-mono text-lg tracking-widest placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-kiparlo-orange focus:border-transparent transition"
              />
            </div>

            {sponsorError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {sponsorError}
              </div>
            )}

            <button
              type="submit"
              disabled={sponsorChecking}
              className="w-full py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sponsorChecking ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Vérification...
                </span>
              ) : (
                "Valider le code parrain"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/auth/login")}
              className="text-kiparlo-gray hover:text-kiparlo-orange text-sm transition-colors"
            >
              Déjà un compte ? Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full">
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
            {refCode && isRegister && (
              <p className="mt-3 text-sm text-kiparlo-orange font-medium">
                🎁 Vous avez été invité{sponsorName ? ` par ${sponsorName}` : ""} — votre parrain sera automatiquement assigné.
              </p>
            )}
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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

  // ─── UI : saisie code ─────────────────────────────────────────────────────
  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md w-full">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Vérifiez votre email</h2>
          <p className="text-gray-400 text-sm">
            Un code à 6 chiffres a été envoyé à{" "}
            <span className="text-kiparlo-orange font-medium">{email}</span>.
          </p>
        </div>

        <form onSubmit={handleVerifyCode} className="space-y-5">
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
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => { setStep("email"); setCode(""); setError(""); }}
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
