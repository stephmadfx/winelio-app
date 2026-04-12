# Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'authentification par mot de passe en complément du code OTP existant, avec possibilité de définir/modifier son mot de passe dans les paramètres.

**Architecture:** Nouvelle route API `/api/auth/login-password` pour se connecter par mot de passe (même pattern cookies que `verify-code`). Route API `/api/auth/set-password` pour définir/modifier le mot de passe d'un utilisateur authentifié. La page de login gagne un toggle "Code / Mot de passe". "Mot de passe oublié ?" redirige simplement vers le tab OTP (le code OTP est le mécanisme de récupération naturel).

**Tech Stack:** Next.js 15 App Router, Supabase Auth (`signInWithPassword` + `admin.updateUserById`), `@supabase/ssr`, Tailwind CSS v4

---

## Fichiers créés / modifiés

| Fichier | Action |
|---------|--------|
| `src/app/api/auth/login-password/route.ts` | CRÉER — login email+mot de passe, pose les cookies de session |
| `src/app/api/auth/set-password/route.ts` | CRÉER — définir/modifier le mot de passe (user authentifié) |
| `src/app/auth/login/page.tsx` | MODIFIER — toggle Code / Mot de passe |
| `src/app/(protected)/settings/page.tsx` | MODIFIER — carte "Sécurité" avec formulaire mot de passe |

---

## Task 1 : Route API `login-password`

**Fichiers :**
- Créer : `src/app/api/auth/login-password/route.ts`

- [ ] **Étape 1 : Créer la route**

```ts
// src/app/api/auth/login-password/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options as Parameters<typeof response.cookies.set>[2],
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect." },
        { status: 401 }
      );
    }

    // Assigner un parrain si nécessaire (auto-rotation fondateurs)
    try {
      await assignSponsorIfNeeded(data.user.id);
    } catch (e) {
      console.error("assign-sponsor in login-password error:", e);
    }

    return response;
  } catch (err) {
    console.error("login-password error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```
Expected : aucune erreur TypeScript sur le nouveau fichier.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/api/auth/login-password/route.ts
git commit -m "feat(auth): route API login par mot de passe"
```

---

## Task 2 : Route API `set-password`

**Fichiers :**
- Créer : `src/app/api/auth/set-password/route.ts`

- [ ] **Étape 1 : Créer la route**

```ts
// src/app/api/auth/set-password/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur connecté depuis les cookies de session
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    // Mettre à jour le mot de passe via le client admin
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    });

    if (error) {
      console.error("set-password admin error:", error);
      return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("set-password error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Étape 3 : Commit**

```bash
git add src/app/api/auth/set-password/route.ts
git commit -m "feat(auth): route API définir/modifier mot de passe"
```

---

## Task 3 : Page de login — toggle Code / Mot de passe

**Fichiers :**
- Modifier : `src/app/auth/login/page.tsx`

Le fichier actuel fait ~333 lignes. Le composant `LoginForm` gère les états `step` ("email" | "code"). Il faut ajouter un `authMethod` ("code" | "password") et un formulaire mot de passe.

- [ ] **Étape 1 : Remplacer `LoginForm` entier**

Remplacer le contenu complet de `src/app/auth/login/page.tsx` par :

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { WinelioLogo } from "@/components/winelio-logo";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBackground } from "@/components/AppBackground";

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
  const [authMethod, setAuthMethod] = useState<"code" | "password">("code");

  // Restaure le dernier email utilisé (sessionStorage : effacé en fin de session)
  useEffect(() => {
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
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Code invalide.");
      setLoading(false);
      return;
    }

    if (data.success) {
      await applyReferral();
      router.push("/dashboard");
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
      router.push("/dashboard");
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
      className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6"
      style={{ paddingBottom: kbPadding }}
    >
      <div className="w-full max-w-md">
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
                Mot de passe oublié ? → Recevoir un code
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
```

- [ ] **Étape 2 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```
Expected : no errors.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/auth/login/page.tsx
git commit -m "feat(auth): toggle code OTP / mot de passe sur la page login"
```

---

## Task 4 : Settings — carte Sécurité (définir/modifier mot de passe)

**Fichiers :**
- Modifier : `src/app/(protected)/settings/page.tsx`

Ajouter un `useState` pour le formulaire mot de passe et insérer une nouvelle `<Card>` entre "À propos" et "Zone dangereuse".

- [ ] **Étape 1 : Ajouter les états et la fonction**

Après la ligne `const [deleteError, setDeleteError] = useState("");` dans `SettingsPage`, ajouter :

```ts
  // État du formulaire mot de passe
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }

    setPasswordLoading(true);
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setPasswordLoading(false);

    if (!res.ok) {
      setPasswordError(data.error || "Une erreur est survenue.");
      return;
    }

    setPasswordSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
  };
```

- [ ] **Étape 2 : Ajouter la carte Sécurité dans le JSX**

Insérer avant `{/* Zone dangereuse */}` :

```tsx
      {/* Sécurité */}
      <Card className="!rounded-2xl mb-4">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Sécurité
          </h3>
          <p className="text-xs text-winelio-gray mb-4">
            Définissez ou modifiez votre mot de passe pour vous connecter sans code email.
          </p>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-winelio-dark">
                Nouveau mot de passe
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); setPasswordSuccess(false); }}
                placeholder="8 caractères minimum"
                autoComplete="new-password"
                className="w-full rounded-xl border border-gray-200 bg-winelio-light/70 px-4 py-2.5 text-sm text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-winelio-dark">
                Confirmer le mot de passe
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); setPasswordSuccess(false); }}
                placeholder="Répétez le mot de passe"
                autoComplete="new-password"
                className="w-full rounded-xl border border-gray-200 bg-winelio-light/70 px-4 py-2.5 text-sm text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-500">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600 font-medium">Mot de passe enregistré avec succès.</p>
            )}

            <button
              type="submit"
              disabled={passwordLoading || !newPassword || !confirmPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-sm font-semibold shadow-[0_8px_20px_rgba(255,107,53,0.2)] transition hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {passwordLoading ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
          </form>
        </CardContent>
      </Card>
```

- [ ] **Étape 3 : Vérifier le build**

```bash
npm run build 2>&1 | tail -20
```
Expected : no errors.

- [ ] **Étape 4 : Commit**

```bash
git add src/app/(protected)/settings/page.tsx
git commit -m "feat(settings): carte Sécurité pour définir/modifier le mot de passe"
```

---

## Task 5 : Test manuel end-to-end

- [ ] **Relancer le serveur dev**

```bash
pkill -f "next dev" ; sleep 1 ; cd /Users/steph/PROJETS/WINELIO/winelio && npm run dev &
```

- [ ] **Test 1 : Login par mot de passe (utilisateur sans mot de passe)**
  - Aller sur `http://localhost:3002/auth/login`
  - Cliquer sur "Mot de passe"
  - Saisir un email valide + n'importe quel mot de passe
  - Expected : message "Email ou mot de passe incorrect."

- [ ] **Test 2 : Définir un mot de passe depuis les Paramètres**
  - Se connecter via code OTP
  - Aller sur `/settings`
  - Carte "Sécurité" visible
  - Saisir un mot de passe < 8 chars → Expected : erreur "8 caractères minimum"
  - Saisir deux mots de passe différents → Expected : "ne correspondent pas"
  - Saisir un mot de passe valide × 2 → Expected : "Mot de passe enregistré avec succès."

- [ ] **Test 3 : Login par mot de passe (utilisateur avec mot de passe)**
  - Se déconnecter
  - Aller sur `/auth/login` → onglet "Mot de passe"
  - Saisir email + mot de passe défini à l'étape précédente
  - Expected : redirect vers `/dashboard`

- [ ] **Test 4 : Mot de passe oublié**
  - Sur l'onglet "Mot de passe", cliquer "Mot de passe oublié ? → Recevoir un code"
  - Expected : bascule sur l'onglet "Code par email"

- [ ] **Test 5 : Vérifier que le code OTP fonctionne toujours**
  - Se déconnecter
  - Utiliser l'onglet "Code par email"
  - Expected : flux OTP normal, redirect `/dashboard`
