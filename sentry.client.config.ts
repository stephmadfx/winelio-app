import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_URL?.includes("dev2") ? "staging" : "production",
  // 10 % d'échantillonnage des transactions perf (pas trop de bruit, free tier OK)
  tracesSampleRate: 0.1,
  // Ne lance Sentry que si DSN défini (pas de bruit en local)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Pas de session replay : économise des events sur le free tier
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
