// Renommé depuis sentry.client.config.ts (déprécié sur Next.js 15+ Turbopack).
// Ce fichier est automatiquement chargé par Next.js côté navigateur.
import * as Sentry from "@sentry/nextjs";

function isIgnoredBrowserNoise(event: Sentry.Event, hint: Sentry.EventHint): boolean {
  const exception = event.exception?.values?.[0];
  const value = exception?.value ?? "";
  const frames = exception?.stacktrace?.frames ?? [];
  const original = hint.originalException;
  const originalName = original instanceof Error ? original.name : "";
  const originalMessage = original instanceof Error ? original.message : String(original ?? "");

  const isNativeShareCancel =
    (originalName === "AbortError" && originalMessage.includes("share")) ||
    value.includes("Abort due to cancellation of share") ||
    originalMessage.includes("Abort due to cancellation of share") ||
    originalMessage.includes("cancellation of share");

  const isSafariMediaControlsNoise =
    value.includes("EmptyRanges") ||
    frames.some((frame) => frame.function === "sortedTrackListForMenu");

  const isConnectionClosedNoise =
    value.includes("Connection closed.") ||
    originalMessage.includes("Connection closed.");

  return isNativeShareCancel || isSafariMediaControlsNoise || isConnectionClosedNoise;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_URL?.includes("dev2") ? "staging" : "production",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event, hint) {
      if (isIgnoredBrowserNoise(event, hint)) return null;
      return event;
    },
  });
}

// Expose Sentry sur window pour pouvoir tester depuis la console (test E2E).
// Aucun risque de sécurité : le SDK est de toute façon chargé côté client.
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).Sentry = Sentry;
}

// Hook officiel exigé depuis Next.js 15 pour tracer les transitions de route.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
