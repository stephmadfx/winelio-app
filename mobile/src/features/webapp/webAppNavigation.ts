const FALLBACK_ORIGIN = "https://winelio.app";

const normalizeOrigin = (value: string) => value.trim().replace(/\/$/, "");

export const webAppOrigin = normalizeOrigin(
  process.env.EXPO_PUBLIC_WEB_APP_URL
    ?? process.env.EXPO_PUBLIC_API_URL
    ?? FALLBACK_ORIGIN,
);

export const webAppEntryUrl = `${webAppOrigin}/auth/login`;

const embeddedPaymentHosts = new Set([
  "checkout.stripe.com",
  "pay.stripe.com",
  "hooks.stripe.com",
]);

export const isEmbeddedNavigation = (url: string) => {
  if (/^(about:blank|blob:|data:)/i.test(url)) return true;

  try {
    const target = new URL(url);
    const app = new URL(webAppOrigin);
    return target.origin === app.origin || embeddedPaymentHosts.has(target.hostname);
  } catch {
    return false;
  }
};

export const isExternalProtocol = (url: string) => /^(mailto:|tel:|sms:|maps:)/i.test(url);
