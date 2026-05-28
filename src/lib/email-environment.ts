const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return null;
}

function getAppHost(): string | null {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getEmailDisabledReason(): string | null {
  const explicit = parseBooleanEnv(process.env.EMAIL_SENDING_ENABLED);
  if (explicit === true) return null;
  if (explicit === false) return "EMAIL_SENDING_ENABLED is disabled";

  const host = getAppHost();
  const productionHosts = new Set(["winelio.app", "www.winelio.app", "app.winelio.app"]);
  if (host && productionHosts.has(host)) return null;

  return host
    ? `outbound email disabled for non-production host ${host}`
    : "outbound email disabled because NEXT_PUBLIC_APP_URL is not configured";
}

export function canSendOutboundEmail(): boolean {
  return getEmailDisabledReason() === null;
}
