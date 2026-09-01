import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/config";
import {
  PROFILE_COMPLETE_COOKIE,
  PROFILE_COMPLETION_SELECT,
  isPersonalProfileComplete,
  isProfessionalProfileComplete,
  isSignupGracePeriod,
  requiresCompleteProfile,
} from "./lib/profile-completion";

// Rate limiter en mémoire (best-effort, par process).
// LIMITATION : en environnement multi-worker (ex: PM2 cluster), chaque worker a son propre
// compteur. Pour une protection stricte, remplacer par un compteur Redis/Upstash.

type Bucket = { count: number; resetAt: number };

// Bucket générique : 60 req/min/IP toutes routes /api confondues
const rateMap = new Map<string, Bucket>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function isPublicApiPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/staging-auth") ||
    path.startsWith("/api/bugs/imap-poll") ||
    path.startsWith("/api/bugs/imap-debug") ||
    path.startsWith("/api/email/process-queue") ||
    path.startsWith("/api/email-track/") ||
    path.startsWith("/api/stripe/webhook") ||
    path.startsWith("/api/stripe/cron-reminders") ||
    path.startsWith("/api/recommendations/process-followups") ||
    path.startsWith("/api/recommendations/cron-scraped-reminder") ||
    path.startsWith("/api/recommendations/followup-action") ||
    path.startsWith("/api/recommendations/client-action") ||
    path.startsWith("/api/pros/cron-onboarding-reminder") ||
    path.startsWith("/api/admin/auth-health")
  );
}

function isPublicPagePath(path: string): boolean {
  return (
    path.startsWith("/auth") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/staging-login") ||
    path.startsWith("/api/staging-auth") ||
    path.startsWith("/commission/success") ||
    path.startsWith("/claim") ||
    path.startsWith("/conditions-generales-utilisation") ||
    path.startsWith("/documents-legaux") ||
    path.startsWith("/suppression-compte") ||
    path.startsWith("/plan-remuneration") ||
    path.startsWith("/recommendations/followup/") ||
    path.startsWith("/recommendations/client/") ||
    path === "/"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Nettoyage périodique des entrées expirées
if (typeof globalThis !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateMap) if (now > val.resetAt) rateMap.delete(key);
  }, 5 * 60_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

export async function middleware(request: NextRequest) {
  // Injecter le chemin d'accès courant pour les Server Components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Protection mot de passe staging (actif si STAGING_PASSWORD est défini)
  const stagingPassword = process.env.STAGING_PASSWORD;
  if (stagingPassword) {
    const path = request.nextUrl.pathname;
    const isCronApi =
      isPublicApiPath(path) ||
      path.startsWith("/recommendations/followup/") ||
      path.startsWith("/recommendations/client/") ||
      path.startsWith("/api/video/");
    const isExempt =
      path === "/staging-login" ||
      path === "/api/staging-auth" ||
      path.startsWith("/auth") ||
      path.startsWith("/api/auth") ||
      isCronApi ||
      path.startsWith("/commission/success") ||
      path.startsWith("/_next/") ||
      path.startsWith("/favicon");

    if (!isExempt) {
      const cookie = request.cookies.get("staging_auth");
      if (cookie?.value !== stagingPassword) {
        const url = request.nextUrl.clone();
        url.pathname = "/staging-login";
        return NextResponse.redirect(url);
      }
    }
  }

  // Rate limiting on auth-sensitive API routes only.
  // Never rate-limit the auth pages themselves, otherwise the login screen can
  // return 429 instead of rendering the code-entry form.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Bypass rate-limit pour la suite E2E : header partagé via env.
    // Le token doit être stocké côté serveur (E2E_BYPASS_TOKEN) ET côté
    // tests (extraHTTPHeaders dans playwright.config.ts).
    const bypassToken = request.headers.get("x-e2e-bypass-token");
    const isE2EBypass =
      !!process.env.E2E_BYPASS_TOKEN &&
      bypassToken === process.env.E2E_BYPASS_TOKEN;

    if (!isE2EBypass && isRateLimited(ip)) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
    // Note : rate-limit dédié OTP (5/heure/IP) est appliqué dans
    // /api/auth/send-code lui-même pour pouvoir exempter les emails
    // de test E2E (@winelio-e2e.local).
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        name: "sb-winelio-auth-token",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            // maxAge EN DERNIER : override le TTL court (3600s) que Supabase fixe sur l'access token
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabaseResponse.cookies.set(name, value, { ...(options ?? {}), maxAge: 60 * 60 * 24 * 365 } as any)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect API routes (except auth callback, tracking, and cron endpoints)
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !isPublicApiPath(request.nextUrl.pathname)
  ) {
    if (!user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }
  }

  // Redirect unauthenticated users to login
  if (
    !user &&
    !isPublicApiPath(request.nextUrl.pathname) &&
    !isPublicPagePath(request.nextUrl.pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages, sauf pendant l'activation
  // d'un filleul préinscrit. La confirmation doit rester accessible même si un
  // autre compte est déjà connecté : verifyOtp remplacera alors cette session.
  // Le filleul confirmé doit ensuite pouvoir atteindre la création du mot de
  // passe, sans boucle /dashboard <-> /auth/create-password.
  const isReferralConfirmation = request.nextUrl.pathname === "/auth/confirm";
  const isPendingPasswordSetup =
    request.nextUrl.pathname === "/auth/create-password" &&
    user?.user_metadata?.requires_password_setup === true;

  if (
    user &&
    request.nextUrl.pathname.startsWith("/auth") &&
    !isReferralConfirmation &&
    !isPendingPasswordSetup
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Protect super admin route — require super_admin role (stored in app_metadata)
  if (request.nextUrl.pathname.startsWith("/gestion-reseau")) {
    if (!user || user.app_metadata?.role !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Profil incomplet -> /profile.
  //
  // Ce contrôle appartient au middleware, pas au layout protégé : un `redirect()`
  // déclenché depuis un layout pendant une navigation client (requête `?_rsc=`)
  // laisse le routeur avec un arbre React vide, et l'utilisateur reste sur une
  // page blanche indéfiniment. Dans le WebView mobile, le garde-fou de 20 s finit
  // par afficher « Connexion impossible ». Cas nominal pour tout nouvel inscrit,
  // dont le profil est par définition incomplet au premier passage.
  if (user && requiresCompleteProfile(request.nextUrl.pathname)) {
    const alreadyValidated = request.cookies.get(PROFILE_COMPLETE_COOKIE)?.value === "1";

    if (!alreadyValidated && !isSignupGracePeriod(user.email_confirmed_at)) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(`${PROFILE_COMPLETION_SELECT}, companies:companies!owner_id(name, siret)`)
        .eq("id", user.id)
        .maybeSingle();

      const companies = Array.isArray(profile?.companies)
        ? profile.companies
        : profile?.companies
          ? [profile.companies]
          : [];

      // Une lecture en échec ne doit pas rejeter un utilisateur en règle vers son
      // profil : on laisse passer et le contrôle sera refait à la navigation suivante.
      const complete =
        !!error ||
        (isPersonalProfileComplete(profile) && isProfessionalProfileComplete(profile, companies));

      if (!complete) {
        const url = request.nextUrl.clone();
        url.pathname = "/profile";
        url.search = "";
        return NextResponse.redirect(url);
      }

      // Le cookie n'est posé que sur une lecture réussie ET un profil complet :
      // une valeur périmée ne peut donc jamais bloquer l'accès, seulement
      // épargner une requête.
      if (!error) {
        supabaseResponse.cookies.set(PROFILE_COMPLETE_COOKIE, "1", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24,
        });
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)",
  ],
};
