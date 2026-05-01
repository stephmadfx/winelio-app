import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/config";

// Rate limiter en mémoire (best-effort, par process).
// LIMITATION : en environnement multi-worker (ex: PM2 cluster), chaque worker a son propre
// compteur. Pour une protection stricte, remplacer par un compteur Redis/Upstash.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requêtes max par fenêtre
const RATE_WINDOW_MS = 60_000; // 1 minute

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
    for (const [key, val] of rateMap) {
      if (now > val.resetAt) rateMap.delete(key);
    }
  }, 5 * 60_000);
  // Permet au process de se terminer sans attendre l'intervalle
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}

export async function middleware(request: NextRequest) {
  // Protection mot de passe staging (actif si STAGING_PASSWORD est défini)
  const stagingPassword = process.env.STAGING_PASSWORD;
  if (stagingPassword) {
    const path = request.nextUrl.pathname;
    const isCronApi =
      path.startsWith("/api/bugs/imap-poll") ||
      path.startsWith("/api/bugs/imap-debug") ||
      path.startsWith("/api/email/process-queue") ||
      path.startsWith("/api/stripe/cron-reminders") ||
      path.startsWith("/api/recommendations/process-followups") ||
      path.startsWith("/api/recommendations/cron-scraped-reminder") ||
      path.startsWith("/api/recommendations/followup-action") ||
      path.startsWith("/recommendations/followup/") ||
      path.startsWith("/api/video/");
    const isExempt =
      path === "/staging-login" ||
      path === "/api/staging-auth" ||
      isCronApi ||
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
    if (isRateLimited(ip)) {
      return new NextResponse("Too Many Requests", { status: 429 });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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

  // Protect API routes (except auth callback and cron endpoints)
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    !request.nextUrl.pathname.startsWith("/api/auth/") &&
    !request.nextUrl.pathname.startsWith("/api/bugs/imap-poll") &&
    !request.nextUrl.pathname.startsWith("/api/bugs/imap-debug") &&
    !request.nextUrl.pathname.startsWith("/api/email/process-queue") &&
    !request.nextUrl.pathname.startsWith("/api/email-track/") &&
    !request.nextUrl.pathname.startsWith("/api/stripe/cron-reminders") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/process-followups") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/cron-scraped-reminder") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/followup-action")
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
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/auth") &&
    !request.nextUrl.pathname.startsWith("/api/bugs/imap-poll") &&
    !request.nextUrl.pathname.startsWith("/api/bugs/imap-debug") &&
    !request.nextUrl.pathname.startsWith("/api/email/process-queue") &&
    !request.nextUrl.pathname.startsWith("/api/email-track/") &&
    !request.nextUrl.pathname.startsWith("/api/stripe/cron-reminders") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/process-followups") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/cron-scraped-reminder") &&
    !request.nextUrl.pathname.startsWith("/api/recommendations/followup-action") &&
    !request.nextUrl.pathname.startsWith("/recommendations/followup/") &&
    !request.nextUrl.pathname.startsWith("/claim") &&
    !request.nextUrl.pathname.startsWith("/conditions-generales-utilisation") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && request.nextUrl.pathname.startsWith("/auth")) {
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ogg)$).*)",
  ],
};
