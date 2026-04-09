"use client";

import { Suspense, useEffect, useState } from "react";
import { WinelioLogo } from "@/components/winelio-logo";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppBackground } from "@/components/AppBackground";

type SupabaseClient = ReturnType<typeof createClient>;

export default function LoginPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
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

  // Restaure le dernier email utilisé (sessionStorage : effacé en fin de session)
  useEffect(() => {
    const saved = sessionStorage.getItem("winelio_last_email");
    if (saved) setEmail(saved);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [sponsorInput, setSponsorInput] = useState("");
  const [sponsorError, setSponsorError] = useState("");
  const [sponsorChecking, setSponsorChecking] = useState(false);
  const [kbPadding, setKbPadding] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Remonte le contenu au-dessus du clavier mobile (visualViewport API)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKbPadding(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const isRegister = searchParams.get("mode") === "register";
  const refCode = searchParams.get("ref");
  const title = isRegister ? "Créer votre accès" : step === "email" ? "Recevoir un code" : "Vérifier le code";
  const subtitle = isRegister
    ? "Winelio reste un réseau fermé: l'inscription passe toujours par un parrain valide."
    : step === "email"
      ? "Entrez votre adresse email, nous vous envoyons un code de connexion à 6 chiffres."
      : "Saisissez le code reçu par email pour ouvrir votre dashboard.";
  const formIcon =
    step === "code"
      ? "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      : "M12 4v16m8-8H4";

  // Stocker le code de parrainage et récupérer le nom du parrain depuis la DB
  useEffect(() => {
    if (!refCode) return;
    localStorage.setItem("winelio_ref", refCode);

    // Toujours fetch depuis la DB (ne pas faire confiance au param URL sponsor_name)
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("sponsor_code", refCode)
        .single()
        .then(({ data }) => {
          if (!data) return;
          const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
          setSponsorName(name || null);
        });
    });
  }, [refCode]);

  // Appliquer le parrainage après connexion réussie
  const applyReferral = async (supabase: SupabaseClient) => {
    const storedRef = localStorage.getItem("winelio_ref");
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
      localStorage.removeItem("winelio_ref");
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
      localStorage.removeItem("winelio_ref");
      return;
    }

    // Assigner le parrain
    await supabase
      .from("profiles")
      .update({ sponsor_id: sponsor.id })
      .eq("id", user.id);

    localStorage.removeItem("winelio_ref");

    // Notifie toute la chaîne de parrainage (jusqu'à 5 niveaux)
    fetch("/api/network/new-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newUserId: user.id }),
    }).catch(() => {/* non bloquant */});
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

    sessionStorage.setItem("winelio_last_email", email);
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

    // Vérifier que le code n'appartient pas à un compte supprimé
    const { data: deleted } = await supabase
      .from("deleted_sponsor_codes")
      .select("sponsor_code")
      .eq("sponsor_code", trimmed)
      .maybeSingle();
    if (deleted) {
      setSponsorChecking(false);
      setSponsorError("Ce code parrain n'est plus disponible.");
      return;
    }

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
    localStorage.setItem("winelio_ref", trimmed);
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.email || "";
    setSponsorName(name || null);
    router.replace(`/auth/login?mode=register&ref=${trimmed}`);
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

    // Session définie côté serveur via cookies HttpOnly
    if (data.success) {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await applyReferral(supabase);
      router.push("/dashboard");
      return;
    }

    setError("Erreur inattendue. Réessayez.");
    setLoading(false);
  };

  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6" style={{ paddingBottom: kbPadding }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <WinelioLogo variant="color" height={40} />
        </div>

        <section className="flex flex-col rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(45,52,54,0.12)] ring-1 ring-black/5 sm:p-8">
          <div className="h-1.5 rounded-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />

          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-winelio-gray">
                {isRegister ? "Invitation requise" : step === "email" ? "Étape 1 sur 2" : "Étape 2 sur 2"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-winelio-dark">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-winelio-gray">{subtitle}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-orange/10 text-winelio-orange">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={formIcon} />
              </svg>
            </div>
          </div>

          {isRegister && refCode && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-winelio-gray">Parrain validé</p>
              <p className="mt-1 text-sm text-winelio-dark">
                {sponsorName ? (
                  <>
                    Compte de <span className="font-semibold">{sponsorName}</span>{" "}
                    <span className="text-winelio-gray">({refCode})</span>
                  </>
                ) : (
                  <>
                    Code <span className="font-semibold">{refCode}</span>
                  </>
                )}
              </p>
            </div>
          )}

          {isRegister && !refCode ? (
            <>
              <div className="mt-6 rounded-2xl border border-gray-100 bg-winelio-light/80 p-4">
                <p className="text-sm font-medium text-winelio-dark">Inscription sur invitation</p>
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  Winelio est un réseau fermé. Pour créer un compte, vous devez disposer du code parrain d&apos;un membre du réseau.
                </p>
              </div>

              <form onSubmit={handleSponsorCodeSubmit} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="sponsor" className="text-sm font-medium text-winelio-dark">
                    Code parrain <span className="text-winelio-orange">*</span>
                  </label>
                  <input
                    id="sponsor"
                    type="text"
                    value={sponsorInput}
                    onChange={(e) => setSponsorInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    placeholder="ex : 4bd0e7"
                    required
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 font-mono text-lg tracking-[0.2em] text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>

                {sponsorError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                    {sponsorError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sponsorChecking}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sponsorChecking ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Vérification...
                    </>
                  ) : (
                    "Valider le code parrain"
                  )}
                </button>
              </form>

              <button
                onClick={() => router.push("/auth/login")}
                className="mt-5 text-left text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                Retour à la connexion
              </button>
            </>
          ) : step === "email" ? (
            <>
              <form onSubmit={handleSendCode} className="mt-6 space-y-5">
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Envoi en cours...
                    </>
                  ) : (
                    "Recevoir le code de connexion"
                  )}
                </button>
              </form>

              <button
                onClick={() => router.push(isRegister ? "/auth/login" : "/auth/login?mode=register")}
                className="mt-5 text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                {isRegister ? "Déjà un compte ? Se connecter" : "Pas de compte ? Créer un compte"}
              </button>
            </>
          ) : (
            <>
              <div className="mt-6 rounded-2xl border border-gray-100 bg-winelio-light/80 p-4">
                <p className="text-sm font-medium text-winelio-dark">Vérifiez votre email</p>
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  Un code à 6 chiffres a été envoyé à <span className="font-semibold text-winelio-orange">{email}</span>.
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="code" className="text-sm font-medium text-winelio-dark">
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
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-center text-2xl tracking-[0.35em] text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-500">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Connexion..." : "Se connecter"}
                </button>
              </form>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                  className="rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-sm font-medium text-winelio-gray transition hover:border-winelio-orange/30 hover:text-winelio-orange"
                >
                  Utiliser une autre adresse
                </button>
                <button
                  onClick={handleSendCode}
                  disabled={loading}
                  className="rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-sm font-medium text-winelio-gray transition hover:border-winelio-orange/30 hover:text-winelio-orange disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Renvoyer le code
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
