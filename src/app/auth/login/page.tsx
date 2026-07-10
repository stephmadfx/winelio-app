"use client";

import { Suspense, useEffect, useState } from "react";
import { WinelioLogo } from "@/components/winelio-logo";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";
import { PROMO_WATCHED_KEY } from "@/components/PromoVideo";
import { safeJsonFetch } from "@/lib/safe-fetch";
import { formatDisplayName } from "@/lib/utils";

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

  // Restaure le dernier email utilisé (localStorage : persiste entre les sessions)
  // ou pré-remplit depuis le query param (invitation par email)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const prefilled = new URLSearchParams(window.location.search).get("email");
    if (prefilled) {
      setEmail(prefilled);
      return;
    }
    const saved = localStorage.getItem("winelio_last_email") || sessionStorage.getItem("winelio_last_email");
    if (saved) setEmail(saved);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [kbPadding, setKbPadding] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [sponsorId, setSponsorId] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [siret, setSiret] = useState("");
  const [nafCode, setNafCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Champs étape 2 (et 3 pour les Pros)
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthDateError, setBirthDateError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const postalTimeoutRef = typeof window !== "undefined" ? { current: null as ReturnType<typeof setTimeout> | null } : { current: null };

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
  const returnTo = searchParams.get("returnTo") || "";
  const isProRegistration = isRegister && (returnTo.startsWith("/claim/") || searchParams.get("type") === "pro");
  const [refCode, setRefCode] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(true);

  // Charger le code de parrainage (URL -> LocalStorage -> Fallback)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlRef = searchParams.get("ref");
    if (urlRef) {
      setRefCode(urlRef);
      localStorage.setItem("winelio_ref", urlRef);
    } else {
      const storedRef = localStorage.getItem("winelio_ref");
      if (storedRef) {
        setRefCode(storedRef);
      }
    }
  }, [searchParams]);

  // Gate vidéo promo : interdire l'accès direct à l'inscription tant que la vidéo
  // n'a pas été regardée à 50%. On renvoie sur la landing en préservant ?ref.
  useEffect(() => {
    if (!isRegister) {
      setCheckingPromo(false);
      return;
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PROMO_WATCHED_KEY) === "1") {
      setCheckingPromo(false);
    } else {
      const target = refCode ? `/?ref=${encodeURIComponent(refCode)}` : "/";
      router.replace(target);
    }
  }, [isRegister, refCode, router]);

  // Récupérer le nom du parrain depuis la DB
  useEffect(() => {
    if (!refCode) return;

    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("sponsor_code", refCode)
        .single()
        .then(({ data }) => {
          if (!data) return;
          setSponsorId(data.id);
          const name = formatDisplayName(data.first_name, data.last_name, "");
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
    setErrorReason(null);
  };

  // Autocomplétion ville depuis code postal (api.gouv.fr)
  const handlePostalCodeChange = (val: string) => {
    setPostalCode(val);
    setCity("");
    setCitySuggestions([]);
    if (postalTimeoutRef.current) clearTimeout(postalTimeoutRef.current);
    if (val.length === 5) {
      postalTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${val}&fields=nom&limit=8`);
          const data: { nom: string }[] = await res.json();
          const cities = data.map((d) => d.nom);
          setCitySuggestions(cities);
          if (cities.length === 1) setCity(cities[0]);
          else if (cities.length > 1) setShowCitySuggestions(true);
        } catch { /* ignore */ }
      }, 300);
    }
  };

  // Validation étape 1 avant de passer à l'étape 2
  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !password) {
      setError("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    setRegisterStep(2);
  };

  // Validation étape 2 pour les pros pour passer à l'étape 3
  const handleNextToStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const bdErr = validateBirthDate();
    if (bdErr) { setBirthDateError(bdErr); return; }
    if (!termsAccepted) { setError("Vous devez accepter les CGU."); return; }
    if (!address.trim() || !postalCode.trim() || !city.trim()) {
      setError("Veuillez compléter votre adresse, code postal et ville.");
      return;
    }
    setRegisterStep(3);
  };

  // Validation date de naissance (18+)
  const validateBirthDate = (): string | null => {
    if (!birthDay || !birthMonth || !birthYear) return "Date de naissance requise.";
    const dob = new Date(parseInt(birthYear), parseInt(birthMonth) - 1, parseInt(birthDay));
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear() - (
      today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0
    );
    if (age < 18) return "Vous devez avoir au moins 18 ans pour vous inscrire.";
    return null;
  };


  // Step 1 : envoyer le code OTP
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await safeJsonFetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    try { localStorage.setItem("winelio_last_email", email); } catch {}
    setStep("code");
    setLoading(false);
  };

  // Step 2 : vérifier le code OTP
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");

    const result = await safeJsonFetch<{ success?: boolean }>("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        sponsorCode: localStorage.getItem("winelio_ref") || null,
      }),
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.data?.success) {
      await applyReferral();
      try { localStorage.setItem("winelio_known_user", "1"); } catch {}
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
    setErrorReason(null);

    const result = await safeJsonFetch<{ success?: boolean; error?: string; reason?: string }>("/api/auth/login-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!result.ok) {
      setError(result.error);
      const reason = (result.data && typeof result.data === "object" && "reason" in result.data)
        ? (result.data as { reason?: string }).reason ?? null
        : null;
      setErrorReason(reason);
      setLoading(false);
      return;
    }

    if (result.data?.success) {
      await applyReferral();
      try { localStorage.setItem("winelio_known_user", "1"); } catch {}
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/dashboard");
      return;
    }

    setError("Erreur inattendue. Réessayez.");
    setLoading(false);
  };

  // Inscription par mot de passe avec métadonnées de profil
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBirthDateError("");
    const bdErr = validateBirthDate();
    if (bdErr) { setBirthDateError(bdErr); return; }
    if (!termsAccepted) { setError("Vous devez accepter les CGU."); return; }
    if (!address.trim() || !postalCode.trim() || !city.trim()) {
      setError("Veuillez compléter votre adresse, code postal et ville.");
      return;
    }
    setLoading(true);
    setError("");
    const birthDate = `${birthYear}-${birthMonth.padStart(2,"0")}-${birthDay.padStart(2,"0")}`;
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          postalCode: postalCode.trim(),
          birthDate,
          termsAccepted,
          sponsorId,
          sponsorCode: refCode || null,
          isPro: isProRegistration,
          companyName: isProRegistration ? companyName.trim() : null,
          siret: isProRegistration ? siret.trim() : null,
          nafCode: isProRegistration ? nafCode.trim() : null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Une erreur est survenue lors de l'inscription.");
        setLoading(false);
        return;
      }
      setSignUpSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Impossible de contacter le serveur d'inscription. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  // Titre dynamique
  const title =
    isRegister
      ? signUpSuccess
        ? "Inscription enregistrée"
        : registerStep === 1 
          ? "Créer votre accès" 
          : registerStep === 2 
            ? "Votre profil" 
            : "Votre entreprise"
      : authMethod === "password"
      ? "Se connecter"
      : step === "email"
      ? "Recevoir un code"
      : "Vérifier le code";

  const subtitle =
    isRegister
      ? signUpSuccess
        ? "Votre compte a été créé. Un e-mail de validation vous a été envoyé."
        : registerStep === 1
          ? "Saisissez vos informations pour finaliser votre inscription."
          : registerStep === 2
            ? "Quelques informations supplémentaires pour compléter votre profil."
            : "Renseignez les détails de votre activité professionnelle."
      : authMethod === "password"
      ? "Connectez-vous avec votre email et votre mot de passe."
      : step === "email"
      ? "Entrez votre adresse email, nous vous envoyons un code de connexion à 6 chiffres."
      : "Saisissez le code reçu par email pour ouvrir votre dashboard.";

  if (isRegister && checkingPromo) {
    return (
      <div className="relative z-10 flex min-h-dvh flex-col justify-center items-center px-4 py-8">
        <div className="w-12 h-12 border-4 border-winelio-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
                  ? `Étape ${registerStep} sur ${isProRegistration ? 3 : 2}`
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
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="username"
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-winelio-dark">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 pl-4 pr-12 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-winelio-gray hover:text-winelio-dark transition-colors"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && errorReason !== "password_not_set" && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                    {error}
                  </div>
                )}

                {errorReason === "password_not_set" && (
                  <div className="rounded-2xl border border-winelio-orange/30 bg-winelio-orange/5 px-4 py-4 text-sm">
                    <p className="font-semibold text-winelio-dark">
                      Aucun mot de passe défini pour ce compte.
                    </p>
                    <p className="mt-1.5 leading-6 text-winelio-gray">
                      Vous vous êtes connecté avec un code par email lors de votre
                      inscription. Pour utiliser un mot de passe, choisissez « Définir
                      un mot de passe » : vous recevrez un code email pour en créer un.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => switchMethod("code")}
                        className="inline-flex items-center justify-center rounded-xl border border-winelio-orange/30 bg-white px-4 py-2 text-xs font-semibold text-winelio-orange transition hover:bg-winelio-orange/10"
                      >
                        Recevoir un code par email
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/auth/forgot-password?email=${encodeURIComponent(email)}`
                          )
                        }
                        className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(255,107,53,0.24)] transition hover:brightness-105"
                      >
                        Définir un mot de passe
                      </button>
                    </div>
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
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => switchMethod("code")}
                  className="font-medium text-winelio-gray transition hover:text-winelio-orange"
                >
                  Code par email →
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/auth/forgot-password")}
                  className="font-medium text-winelio-orange transition hover:text-winelio-amber"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </>
          )}

          {/* ── Formulaire d'inscription (Option A) ── */}
          {isRegister && signUpSuccess && (
            <div className="mt-6 space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-winelio-dark">Vérifiez vos e-mails</h3>
                <p className="text-sm leading-6 text-winelio-gray">
                  Nous avons envoyé un lien de confirmation à <span className="font-semibold text-winelio-orange">{email}</span>.
                  Veuillez cliquer sur ce lien pour activer votre compte.
                </p>
              </div>
              <button
                onClick={() => router.push("/auth/login")}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-winelio-dark transition hover:border-winelio-orange/30 hover:text-winelio-orange"
              >
                Retourner à la connexion
              </button>
            </div>
          )}

          {isRegister && !signUpSuccess && registerStep === 1 && (
            <form onSubmit={handleNextStep} className="mt-6 space-y-5">
              {/* Indicateur d'étape */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                <div className="flex-1 h-1 rounded-full bg-gray-200" />
                <span className="text-xs text-winelio-gray ml-1">Étape 1/2</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm font-medium text-winelio-dark">
                    Prénom <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jean"
                    required
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium text-winelio-dark">
                    Nom <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Dupont"
                    required
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-winelio-dark">
                  Téléphone <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0612345678"
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              {isProRegistration && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="siret" className="text-sm font-medium text-winelio-dark">
                      Numéro SIRET <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="siret"
                      type="text"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                      placeholder="12345678901234"
                      required={isProRegistration}
                      className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="nafCode" className="text-sm font-medium text-winelio-dark">
                      Code APE / NAF <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="nafCode"
                      type="text"
                      value={nafCode}
                      onChange={(e) => setNafCode(e.target.value)}
                      placeholder="8559A"
                      required={isProRegistration}
                      className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-winelio-dark">
                  Adresse email <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="username"
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="reg-password" className="text-sm font-medium text-winelio-dark">
                  Mot de passe <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8 caractères minimum"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 pl-4 pr-12 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-winelio-gray hover:text-winelio-dark transition-colors"
                    aria-label={showPassword ? "Masquer" : "Afficher"}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105"
              >
                Continuer →
              </button>

              <button
                type="button"
                onClick={() => router.push("/auth/login")}
                className="mt-2 text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                Déjà un compte ? Se connecter
              </button>
            </form>
          )}

          {/* ── FORMULAIRE INSCRIPTION ÉTAPE 2 ── */}
          {isRegister && !signUpSuccess && registerStep === 2 && (
            <form onSubmit={isProRegistration ? handleNextToStep3 : handleRegister} className="mt-6 space-y-5">
              {/* Indicateur d'étape */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                {isProRegistration && <div className="flex-1 h-1 rounded-full bg-gray-200" />}
                <span className="text-xs text-winelio-gray ml-1">
                  Étape 2/{isProRegistration ? "3" : "2"}
                </span>
              </div>

              {/* Date de naissance */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-winelio-dark">
                  Date de naissance <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-winelio-gray font-normal">(18 ans minimum)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={birthDay}
                    onChange={(e) => setBirthDay(e.target.value)}
                    required
                    className="flex-1 rounded-2xl border border-gray-200 bg-winelio-light/70 px-3 py-3 text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  >
                    <option value="">Jour</option>
                    {Array.from({ length: 31 }, (_, i) => {
                      const v = String(i + 1).padStart(2, "0");
                      return <option key={v} value={v}>{i + 1}</option>;
                    })}
                  </select>
                  <select
                    value={birthMonth}
                    onChange={(e) => setBirthMonth(e.target.value)}
                    required
                    className="flex-[1.5] rounded-2xl border border-gray-200 bg-winelio-light/70 px-3 py-3 text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  >
                    <option value="">Mois</option>
                    {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((m, i) => (
                      <option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    required
                    className="flex-[1.2] rounded-2xl border border-gray-200 bg-winelio-light/70 px-3 py-3 text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  >
                    <option value="">Année</option>
                    {Array.from({ length: new Date().getFullYear() - 18 - 1919 }, (_, i) => {
                      const y = new Date().getFullYear() - 18 - i;
                      return <option key={y} value={String(y)}>{y}</option>;
                    })}
                  </select>
                </div>
                {birthDateError && (
                  <p className="text-xs text-red-500">{birthDateError}</p>
                )}
              </div>

              {/* Adresse */}
              <div className="space-y-2">
                <label htmlFor="address" className="text-sm font-medium text-winelio-dark">
                  Adresse <span className="text-red-500">*</span>
                </label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="12 rue de la Paix"
                  required
                  autoComplete="street-address"
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              {/* Code postal + Ville */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="postalCode" className="text-sm font-medium text-winelio-dark">
                    Code postal <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="postalCode"
                    type="text"
                    value={postalCode}
                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                    placeholder="75001"
                    required
                    maxLength={5}
                    autoComplete="postal-code"
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                </div>
                <div className="space-y-2 relative">
                  <label htmlFor="city" className="text-sm font-medium text-winelio-dark">
                    Ville <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    onFocus={() => { if (citySuggestions.length > 0) setShowCitySuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
                    placeholder="Paris"
                    required
                    autoComplete="off"
                    className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                  />
                  {showCitySuggestions && citySuggestions.length > 0 && (
                    <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {citySuggestions.map((c) => (
                        <li
                          key={c}
                          onMouseDown={() => { setCity(c); setShowCitySuggestions(false); }}
                          className="px-4 py-2.5 text-sm text-winelio-dark hover:bg-winelio-orange/5 hover:text-winelio-orange cursor-pointer"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* CGU */}
              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-winelio-light/50 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-winelio-orange focus:ring-winelio-orange"
                />
                <span className="text-sm leading-6 text-winelio-gray">
                  J&apos;ai lu et j&apos;accepte les{" "}
                  <a
                    href="/conditions-generales-utilisation"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-winelio-orange underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Conditions Générales d&apos;Utilisation Winelio
                  </a>
                </span>
              </label>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setRegisterStep(1); setError(""); }}
                  className="flex-1 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-winelio-dark transition hover:border-winelio-orange/30 hover:text-winelio-orange"
                >
                  ← Retour
                </button>
                <button
                  type="submit"
                  disabled={!termsAccepted || (loading && !isProRegistration)}
                  className="flex-[2] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProRegistration ? (
                    "Continuer →"
                  ) : loading ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Inscription…
                    </>
                  ) : (
                    "Créer mon compte"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ── FORMULAIRE INSCRIPTION ÉTAPE 3 (PRO) ── */}
          {isRegister && !signUpSuccess && registerStep === 3 && (
            <form onSubmit={handleRegister} className="mt-6 space-y-5">
              {/* Indicateur d'étape */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                <div className="flex-1 h-1 rounded-full bg-winelio-orange" />
                <span className="text-xs text-winelio-gray ml-1">Étape 3/3</span>
              </div>

              {/* Raison sociale */}
              <div className="space-y-2">
                <label htmlFor="companyName" className="text-sm font-medium text-winelio-dark">
                  Raison sociale / Nom de l'entreprise <span className="text-red-500">*</span>
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Électricité Martin & Fils"
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              {/* Numéro SIRET */}
              <div className="space-y-2">
                <label htmlFor="siret" className="text-sm font-medium text-winelio-dark">
                  Numéro SIRET <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-winelio-gray font-normal">(14 chiffres)</span>
                </label>
                <input
                  id="siret"
                  type="text"
                  value={siret}
                  onChange={(e) => setSiret(e.target.value.replace(/\s/g, ""))}
                  placeholder="12345678901234"
                  maxLength={14}
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              {/* Code APE / NAF */}
              <div className="space-y-2">
                <label htmlFor="nafCode" className="text-sm font-medium text-winelio-dark">
                  Code APE / NAF <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-winelio-gray font-normal">(Ex: 4321A)</span>
                </label>
                <input
                  id="nafCode"
                  type="text"
                  value={nafCode}
                  onChange={(e) => setNafCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                  placeholder="4321A"
                  maxLength={5}
                  required
                  className="w-full rounded-2xl border border-gray-200 bg-winelio-light/70 px-4 py-3 text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setRegisterStep(2); setError(""); }}
                  className="flex-1 rounded-2xl border border-gray-200 bg-white px-5 py-3.5 text-sm font-semibold text-winelio-dark transition hover:border-winelio-orange/30 hover:text-winelio-orange"
                >
                  ← Retour
                </button>
                <button
                  type="submit"
                  disabled={loading || !companyName.trim() || siret.length !== 14 || !nafCode.trim()}
                  className="flex-[2] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,107,53,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Inscription…
                    </>
                  ) : (
                    "Créer mon compte pro"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ── Formulaire CODE OTP — Step email ── */}
          {!isRegister && authMethod === "code" && step === "email" && (
            <>
              <form onSubmit={handleSendCode} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-winelio-dark">
                    Adresse email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="username"
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
                  router.push("/auth/login?mode=register")
                }
                className="mt-5 text-sm font-medium text-winelio-gray transition hover:text-winelio-orange"
              >
                Pas de compte ? Créer un compte
              </button>
            </>
          )}

          {/* ── Formulaire CODE OTP — Step code ── */}
          {!isRegister && authMethod === "code" && step === "code" && (
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
