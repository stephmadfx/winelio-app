import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_URL?.includes("dev2") ? "staging" : "production",
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      const exception = event.exception?.values?.[0];
      const value = exception?.value ?? "";
      const message = hint.originalException instanceof Error ? hint.originalException.message : String(hint.originalException ?? "");
      
      // Filtre l'erreur de déconnexion client intempestive côté Edge Runtime
      if (value.includes("aborted") || message.includes("aborted")) {
        return null;
      }
      return event;
    },
  });
}
