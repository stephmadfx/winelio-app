const FALLBACK_ORIGIN = "https://winelio.app";

const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, "");

export const webAppOrigin = normalizeOrigin(
  process.env.EXPO_PUBLIC_WEB_APP_URL
    ?? process.env.EXPO_PUBLIC_API_URL
    ?? FALLBACK_ORIGIN,
);

export const webAppEntryUrl = `${webAppOrigin}/auth/login`;

const isStripeEmbeddedHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return (
    host === "stripe.com"
    || host.endsWith(".stripe.com")
    || host === "stripe.network"
    || host.endsWith(".stripe.network")
  );
};

export const isEmbeddedNavigation = (url: string) => {
  if (/^(about:blank|blob:|data:)/i.test(url)) return true;

  try {
    const target = new URL(url);
    const app = new URL(webAppOrigin);
    return target.origin === app.origin || isStripeEmbeddedHost(target.hostname);
  } catch {
    return false;
  }
};

/**
 * Décide si l'URL doit rester dans le WebView.
 * Les iframes (Stripe Elements, 3-D Secure) ne sont jamais interceptées :
 * les ouvrir dans Chrome cassait l'enregistrement de carte ("rien ne se passe").
 */
export const shouldLoadInWebView = (url: string, isTopFrame?: boolean) => {
  if (isTopFrame === false) return true;
  return isEmbeddedNavigation(url);
};

export const isExternalProtocol = (url: string) => /^(mailto:|tel:|sms:|maps:)/i.test(url);
