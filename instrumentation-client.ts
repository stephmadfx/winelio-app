// Renommé depuis sentry.client.config.ts (déprécié sur Next.js 15+ Turbopack).
// Ce fichier est automatiquement chargé par Next.js côté navigateur.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_URL?.includes("dev2") ? "staging" : "production",
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Expose Sentry sur window pour pouvoir tester depuis la console (test E2E).
// Aucun risque de sécurité : le SDK est de toute façon chargé côté client.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).Sentry = Sentry;
}

// Hook officiel exigé depuis Next.js 15 pour tracer les transitions de route.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
