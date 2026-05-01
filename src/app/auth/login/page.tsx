"use client";

import { Suspense, useEffect, useState } from "react";
import { WinelioLogo } from "@/components/winelio-logo";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { PROMO_WATCHED_KEY } from "@/components/PromoVideo";

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
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [authMethod, setAuthMethod] = useState<"code" | "password">("password");

  // Restaure le dernier email utilisé (sessionStorage : effacé en fin de session)
  // ou pré-remplit depuis le query param (invitation par email)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const prefilled = new URLSearchParams(window.location.search).get("email");
    if (prefilled) {
      setEmail(prefilled);
      return;
    }
    const saved = sessionStorage.getItem("winelio_last_email");
    if (saved) setEmail(saved);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [kbPadding, setKbPadding] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Remonte le contenu au-dessus du clavier mobile (visualViewport API)
  // Stratégie : détecte la réduction de la zone visible et applique un paddingBottom
  // pour pousser le contenu au-dessus du clavier.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Hauteur perdue = différence entre la hauteur originale et la hauteur visuelle actuelle
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height);
      setKbPadding(keyboardHeight + 16); // 16px de marge de sécurité
    };
    // Premier appel pour capturer la hauteur initiale
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);


  const isRegister = searchParams.get("mode") === "register";
  const refCode = searchParams.get("ref");

  // Gate vidéo promo : interdire l'accès direct à l'inscription tant que la vidéo
  // n'a pas été regardée à 50%. On renvoie sur la landing en préservant ?ref.
  useEffect(() => {
    if (!isRegister) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PROMO_WATCHED_KEY) === "1") return;
    const target = refCode ? `/?ref=${encodeURIComponent(refCode)}` : "/";
    router.replace(target);
  }, [isRegister, refCode, router]);

  // Stocker le code de parrainage et récupérer le nom du parrain depuis la DB
  useEffect(() => {
    if (!refCode) return;
    localStorage.setItem("winelio_ref", refCode);

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

  // Appliquer le parrainage après connexion/inscription
  const applyReferral = async () => {
    const storedRef = localStorage.getItem("winelio_ref");
    if (!storedRef) return;
    await fetch("/api/auth/assign-sponsor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsorCode: storedRef }),
    }).catch(() => {});
    localStorage.removeItem("winelio_ref");
  };

  // Changer de méthode : reset les états liés à l'autre méthode
  const switchMethod = (method: "code" | "password") => {
    setAuthMethod(method);
    setStep("email");
    setCode("");
    setPassword("");
    setError("");
  };

  // Step 1 : envoyer le code OTP
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

  // Step 2 : vérifier le code OTP
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        sponsorCode: localStorage.getItem("winelio_ref") || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Code invalide.");
      setLoading(false);
      return;
    }

    if (data.success) {
      await applyReferral();
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/dashboard");
      return;
    }

    setError("Erreur inattendue. Réessayez.");
    setLoading(false);
  };

  // Login par mot de passe
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    if (data.success) {
      await applyReferral();
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/dashboard");
      return;
    }

    setError("Erreur inattendue. Réessayez.");
    setLoading(false);
  };

  // Titre dynamique
  const title =
    isRegister
      ? "Créer votre accès"
      : authMethod === "password"
      ? "Se connecter"
      : step === "email"
      ? "Recevoir un code"
      : "Vérifier le code";

  const subtitle =
    isRegister
      ? step === "email"
        ? "Entrez votre adresse email pour recevoir votre code d'accès."
        : "Saisissez le code reçu par email pour finaliser votre inscription."
      : authMethod === "password"
      ? "Connectez-vous avec votre email et votre mot de passe."
      : step === "email"
      ? "Entrez votre adresse email, nous vous envoyons un code de connexion à 6 chiffres."
      : "Saisissez le code reçu par email pour ouvrir votre dashboard.";

  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col justify-center overflow-y-auto px-4 py-8 sm:px-6"
      style={{ paddingBottom: kbPadding }}
    >
      <div className="my-auto w-full max-w-md">

        <div className="mb-8 flex justify-center">
          <WinelioLogo variant="color" height={40} />
        </div>

        <section className="flex flex-col rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(45,52,54,0.12)] ring-1 ring-black/5 sm:p-8">
          <div className="h-1.5 rounded-full bg-gradient-to-r from-winelio-orange via-winelio-amber to-winelio-orange" />

          {/* Toggle Code / Mot de passe (seulement en mode connexion, pas inscription) */}
          {!isRegister && (
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => switchMethod("code")}
                className={`rounded-lg py-2 text-sm font-medium transition-all ${
                  authMethod === "code"
                    ? "bg-white text-winelio-dark shadow-sm"
                    : "text-winelio-gray hover:text-winelio-dark"
                }`}
              >
                Code par email
              </button>
              <button
                type="button"
                onClick={() => switchMethod("password")}
                className={`rounded-lg py-2 text-sm font-medium transition-all ${
                  authMethod === "password"
                    ? "bg-white text-winelio-dark shadow-sm"
                    : "text-winelio-gray hover:text-winelio-dark"
                }`}
              >
                Mot de passe
              </button>
            </div>
          )}

          <div className="mt-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-winelio-gray">
                {isRegister
                  ? refCode
                    ? "Invitation reçue"
                    : "Inscription"
                  : authMethod === "password"
                  ? "Connexion"
                  : step === "email"
                  ? "Étape 1 sur 2"
                  : "Étape 2 sur 2"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-winelio-dark">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-winelio-gray">{subtitle}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-winelio-orange/10 text-winelio-orange">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={
                    authMethod === "password" && !isRegister
                      ? "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      : step === "code"
                      ? "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      : "M12 4v16m8-8H4"
                  }
                />
              </svg>
            </div>
          </div>

          {/* Bloc parrain */}
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
                  <>Code <span className="font-semibold">{refCode}</span></>
                )}
              </p>
            </div>
          )}

          {isRegister && !refCode && (
            <div className="mt-5 rounded-2xl border border-gray-100 bg-winelio-light/80 px-4 py-3">
              <p className="text-sm leading-6 text-winelio-gray">
                Vous serez automatiquement rattaché à un parrain de notre réseau.
              </p>
            </div>
          )}

          {/* ── Formulaire MOT DE PASSE ── */}
          {!isRegister && authMethod === "password" && (
            <>
              <form onSubmit={handlePasswordLogin} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email-pw" className="text-sm font-medium text-winelio-dark">
                    Adresse email
                  </label>
                  <input
                    id="email-pw"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    required
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-winelio-dark">
                    Mot de passe
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
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
                      Connexion…
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </button>
              </form>
              <button
                type="button"
                onClick={() => switchMethod("code")}
                className="mt-4 text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                Mot de passe oublié ? Se connecter par code email →
              </button>
            </>
          )}

          {/* ── Formulaire CODE OTP — Step email ── */}
          {(isRegister || authMethod === "code") && step === "email" && (
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
                      Envoi en cours…
                    </>
                  ) : (
                    "Recevoir le code de connexion"
                  )}
                </button>
              </form>

              <button
                onClick={() =>
                  router.push(isRegister ? "/auth/login" : "/auth/login?mode=register")
                }
                className="mt-5 text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                {isRegister ? "Déjà un compte ? Se connecter" : "Pas de compte ? Créer un compte"}
              </button>
            </>
          )}

          {/* ── Formulaire CODE OTP — Step code ── */}
          {(isRegister || authMethod === "code") && step === "code" && (
            <>
              <div className="mt-6 rounded-2xl border border-gray-100 bg-winelio-light/80 p-4">
                <p className="text-sm font-medium text-winelio-dark">Vérifiez votre email</p>
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  Un code à 6 chiffres a été envoyé à{" "}
                  <span className="font-semibold text-winelio-orange">{email}</span>.
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-winelio-gray/80">
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-winelio-orange/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>La réception peut prendre de quelques secondes à quelques minutes. Pensez à vérifier vos spams.</span>
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
                  {loading ? "Connexion…" : "Se connecter"}
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
