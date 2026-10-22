export type ReferralInvite = { code: string; professional: boolean; videoWatched: boolean };

export const APP_STORE_URL = "https://apps.apple.com/fr/app/winelio/id6792769653";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.winelio.mobile";

export function referralFromParams(params: URLSearchParams): ReferralInvite | null {
  if (["ref", "type", "video"].some((key) => params.getAll(key).length > 1)) return null;
  const code = params.get("ref")?.trim().toUpperCase() || "";
  // Les invitations historiques ont six caractères, les nouvelles en ont huit.
  if (!/^(?:[A-Z0-9]{6}|[A-Z0-9]{8})$/.test(code)) return null;
  const type = params.get("type");
  if (type && type !== "pro") return null;
  return { code, professional: type === "pro", videoWatched: params.get("video") === "1" };
}

export function referralParams(invite: ReferralInvite): URLSearchParams {
  const params = new URLSearchParams({ ref: invite.code });
  if (invite.professional) params.set("type", "pro");
  if (invite.videoWatched) params.set("video", "1");
  return params;
}

export function parseReferralLink(value: string): ReferralInvite | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.port || url.hash) return null;
    const web = url.protocol === "https:" && url.hostname === "winelio.app"
      && ["/", "/auth/login"].includes(url.pathname);
    const native = url.protocol === "winelio:" && url.hostname === "invite"
      && ["", "/"].includes(url.pathname);
    return web || native ? referralFromParams(url.searchParams) : null;
  } catch {
    return null;
  }
}

export function parseInstallReferrer(value: string): ReferralInvite | null {
  if (value.length > 2048) return null;
  const params = new URLSearchParams(value);
  if (params.getAll("winelio_invite").length !== 1 || params.get("winelio_invite") !== "1") return null;
  return referralFromParams(params);
}

export function referralRegistrationPath(invite: ReferralInvite): string {
  const params = referralParams(invite);
  params.set("mode", "register");
  return `/auth/login?${params}`;
}

export function referralClipboardLink(invite: ReferralInvite): string {
  return `https://winelio.app/?${referralParams(invite)}`;
}

export function referralAppLink(invite: ReferralInvite): string {
  return `winelio://invite?${referralParams(invite)}`;
}

export function referralPlayStoreLink(invite: ReferralInvite): string {
  const referrer = referralParams(invite);
  referrer.set("winelio_invite", "1");
  const url = new URL(PLAY_STORE_URL);
  url.searchParams.set("referrer", referrer.toString());
  return url.toString();
}
