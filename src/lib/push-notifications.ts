import crypto from "node:crypto";
import http2 from "node:http2";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type NotificationPreferences = {
  in_app_badges: boolean;
  email_major_announcements: boolean;
  notify_official_announcements: boolean;
  notify_community_messages: boolean;
  notify_message_replies: boolean;
  notify_new_referral: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  in_app_badges: true,
  email_major_announcements: true,
  notify_official_announcements: true,
  notify_community_messages: true,
  notify_message_replies: true,
  notify_new_referral: true,
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type WebPushSubscriptionJson = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// Allowlist stricte des fournisseurs W3C Web Push officiels (prévention SSRF)
const ALLOWED_WEBPUSH_HOST_SUFFIXES = [
  ".push.apple.com",
  "fcm.googleapis.com",
  ".googleapis.com",
  ".google.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
  ".mozaws.net",
  ".push.samsungosp.com",
];

export function isAllowedWebPushEndpoint(rawEndpoint: string): boolean {
  try {
    const parsed = new URL(rawEndpoint);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_WEBPUSH_HOST_SUFFIXES.some((suffix) =>
      suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix,
    );
  } catch {
    return false;
  }
}

export function parseWebPushSubscription(raw: unknown): WebPushSubscriptionJson | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as Record<string, unknown>;
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048 || !isAllowedWebPushEndpoint(endpoint)) {
    return null;
  }
  const keys = sub.keys && typeof sub.keys === "object" ? (sub.keys as Record<string, unknown>) : null;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";
  if (!p256dh || !auth) return null;

  try {
    const pubBytes = Buffer.from(p256dh, "base64url");
    const authBytes = Buffer.from(auth, "base64url");
    if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) return null;
    if (authBytes.length < 12 || authBytes.length > 64) return null;
  } catch {
    return null;
  }

  return { endpoint, keys: { p256dh, auth } };
}

function base64UrlJson(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

/**
 * Génère une paire de clés VAPID P-256 (publicKey base64url 65 octets + PEM privé PKCS#8).
 */
export function generateVapidKeyPair(): { publicKey: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const uncompressedPub = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    publicKey: uncompressedPub.toString("base64url"),
    privateKeyPem,
  };
}

let cachedVapidKeys: { publicKey: string; privateKeyPem: string } | null = null;

export async function getOrCreateVapidKeys(): Promise<{
  publicKey: string;
  privateKeyPem: string;
}> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY_PEM) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
      privateKeyPem: process.env.VAPID_PRIVATE_KEY_PEM.replace(/\\n/g, "\n"),
    };
  }
  if (cachedVapidKeys) return cachedVapidKeys;

  const { data: existing } = await supabaseAdmin
    .from("push_vapid_keys")
    .select("public_key, private_key_pem")
    .eq("id", 1)
    .maybeSingle();

  if (existing?.public_key && existing?.private_key_pem) {
    cachedVapidKeys = {
      publicKey: existing.public_key,
      privateKeyPem: existing.private_key_pem,
    };
    return cachedVapidKeys;
  }

  const generated = generateVapidKeyPair();
  await supabaseAdmin
    .from("push_vapid_keys")
    .upsert(
      {
        id: 1,
        public_key: generated.publicKey,
        private_key_pem: generated.privateKeyPem,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  const { data: confirmed } = await supabaseAdmin
    .from("push_vapid_keys")
    .select("public_key, private_key_pem")
    .eq("id", 1)
    .single();

  cachedVapidKeys = {
    publicKey: confirmed?.public_key || generated.publicKey,
    privateKeyPem: confirmed?.private_key_pem || generated.privateKeyPem,
  };
  return cachedVapidKeys;
}

/**
 * RFC 8292 — En-tête Authorization VAPID signé ES256 (P-256 IEEE P1363).
 */
export function buildVapidAuthHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKeyPem: string,
  subject = "mailto:support@winelio.app",
): string {
  const origin = new URL(endpoint).origin;
  const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
  const payload = base64UrlJson({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  });
  const unsigned = `${header}.${payload}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned, "ascii"), {
    key: vapidPrivateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${unsigned}.${sig.toString("base64url")}, k=${vapidPublicKey}`;
}

/**
 * RFC 8291 + RFC 8188 — Chiffrement Web Push `aes128gcm` sans dépendance externe.
 */
export function encryptWebPushPayload(
  plaintextUtf8: string,
  subscriptionKeys: { p256dh: string; auth: string },
): Buffer {
  const uaPublic = Buffer.from(subscriptionKeys.p256dh, "base64url");
  const authSecret = Buffer.from(subscriptionKeys.auth, "base64url");

  const asEcdh = crypto.createECDH("prime256v1");
  asEcdh.generateKeys();
  const asPublic = asEcdh.getPublicKey();
  const ecdhSecret = asEcdh.computeSecret(uaPublic);

  const salt = crypto.randomBytes(16);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "ascii"),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));

  const cek = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0", "ascii"),
      16,
    ),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: nonce\0", "ascii"),
      12,
    ),
  );

  // Dernier et unique enregistrement terminé par l'octet délimiteur 0x02 (RFC 8188)
  const record = Buffer.concat([Buffer.from(plaintextUtf8, "utf8"), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, encrypted]);
}

async function sendWebPush(
  rawTokenJson: string,
  payload: PushPayload,
): Promise<{ ok: boolean; permanentInvalid: boolean }> {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawTokenJson);
  } catch {
    return { ok: false, permanentInvalid: true };
  }
  const sub = parseWebPushSubscription(parsed);
  if (!sub) return { ok: false, permanentInvalid: true };

  const vapid = await getOrCreateVapidKeys();
  const body = encryptWebPushPayload(JSON.stringify(payload), sub.keys);
  const authHeader = buildVapidAuthHeader(sub.endpoint, vapid.publicKey, vapid.privateKeyPem);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: new Uint8Array(body),
  });

  if (res.status >= 200 && res.status < 300) {
    return { ok: true, permanentInvalid: false };
  }
  if (res.status === 404 || res.status === 410) {
    return { ok: false, permanentInvalid: true };
  }
  return { ok: false, permanentInvalid: false };
}

// ── Apple APNs (iPhone natif HTTP/2 + JWT ES256) ────────────────────────────
let cachedApnsJwt: { token: string; expiresAt: number } | null = null;

function getApnsBearerToken(): { jwt: string; bundleId: string; host: string } | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const rawPem = process.env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !rawPem) return null;

  const teamId = (process.env.APNS_TEAM_ID || "QTG533MH6L").trim();
  const bundleId = (process.env.APNS_BUNDLE_ID || "app.winelio.mobile").trim();
  const host =
    process.env.APNS_SANDBOX === "true"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const nowMs = Date.now();
  if (cachedApnsJwt && nowMs < cachedApnsJwt.expiresAt) {
    return { jwt: cachedApnsJwt.token, bundleId, host };
  }

  const pem = rawPem.replace(/\\n/g, "\n");
  const header = base64UrlJson({ alg: "ES256", kid: keyId });
  const claims = base64UrlJson({ iss: teamId, iat: Math.floor(nowMs / 1000) });
  const unsigned = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned, "ascii"), {
    key: pem,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${unsigned}.${sig.toString("base64url")}`;
  // Apple exige de conserver le même provider token au moins 20 min (max 60 min)
  cachedApnsJwt = { token, expiresAt: nowMs + 50 * 60_000 };
  return { jwt: token, bundleId, host };
}

async function sendApnsPush(
  deviceToken: string,
  payload: PushPayload,
): Promise<{ ok: boolean; permanentInvalid: boolean }> {
  const cleanHex = deviceToken.trim().replace(/[<>\s]/g, "");
  if (!/^[0-9a-f]{32,200}$/i.test(cleanHex)) {
    return { ok: false, permanentInvalid: true };
  }
  const cfg = getApnsBearerToken();
  if (!cfg) {
    // Clé APNs .p8 non encore configurée sur l'environnement : le token reste actif en base
    return { ok: false, permanentInvalid: false };
  }

  const bodyStr = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
    url: payload.url,
    tag: payload.tag || "winelio",
  });

  return new Promise((resolve) => {
    const client = http2.connect(cfg.host);
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ ok: false, permanentInvalid: false });
    }, 8_000);

    client.on("error", () => {
      clearTimeout(timeout);
      client.close();
      resolve({ ok: false, permanentInvalid: false });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${cleanHex}`,
      authorization: `bearer ${cfg.jwt}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let respText = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      respText += chunk;
    });
    req.on("end", () => {
      clearTimeout(timeout);
      client.close();
      if (status === 200) {
        resolve({ ok: true, permanentInvalid: false });
        return;
      }
      const permanent =
        status === 410 ||
        respText.includes("BadDeviceToken") ||
        respText.includes("Unregistered");
      resolve({ ok: false, permanentInvalid: permanent });
    });
    req.on("error", () => {
      clearTimeout(timeout);
      client.close();
      resolve({ ok: false, permanentInvalid: false });
    });

    req.end(bodyStr);
  });
}

// ── Google FCM HTTP v1 (Android natif) ──────────────────────────────────────
let cachedFcmAccess: { accessToken: string; projectId: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<{ accessToken: string; projectId: string } | null> {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!rawJson) return null;

  const nowMs = Date.now();
  if (cachedFcmAccess && nowMs < cachedFcmAccess.expiresAt) {
    return { accessToken: cachedFcmAccess.accessToken, projectId: cachedFcmAccess.projectId };
  }

  let sa: { project_id?: string; client_email?: string; private_key?: string };
  try {
    const decoded = rawJson.startsWith("{")
      ? rawJson
      : Buffer.from(rawJson, "base64").toString("utf8");
    sa = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) return null;

  const nowSec = Math.floor(nowMs / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(unsigned, "ascii"), sa.private_key);
  const assertion = `${unsigned}.${sig.toString("base64url")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenRes.ok) return null;

  const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokenData.access_token) return null;

  cachedFcmAccess = {
    accessToken: tokenData.access_token,
    projectId: sa.project_id,
    expiresAt: nowMs + Math.max((tokenData.expires_in ?? 3600) - 300, 60) * 1000,
  };
  return { accessToken: cachedFcmAccess.accessToken, projectId: sa.project_id };
}

async function sendFcmPush(
  fcmToken: string,
  payload: PushPayload,
): Promise<{ ok: boolean; permanentInvalid: boolean }> {
  const clean = fcmToken.trim();
  if (!clean || clean.length < 20) return { ok: false, permanentInvalid: true };

  const auth = await getFcmAccessToken();
  if (!auth) {
    // Compte de service Firebase non encore configuré : le token reste actif en base
    return { ok: false, permanentInvalid: false };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(auth.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: clean,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: payload.url,
            tag: payload.tag || "winelio",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "winelio-default",
              color: "#FF6B35",
              sound: "default",
            },
          },
        },
      }),
    },
  );

  if (res.ok) return { ok: true, permanentInvalid: false };
  const errBody = await res.text().catch(() => "");
  const permanent =
    res.status === 404 ||
    errBody.includes("UNREGISTERED") ||
    errBody.includes("INVALID_ARGUMENT");
  return { ok: false, permanentInvalid: permanent };
}

// ── Préférences utilisateur (tout activé par défaut) ────────────────────────
export function normalizeNotificationPreferences(
  row?: Partial<NotificationPreferences> | null,
): NotificationPreferences {
  return {
    in_app_badges: row?.in_app_badges !== false,
    email_major_announcements: row?.email_major_announcements !== false,
    notify_official_announcements: row?.notify_official_announcements !== false,
    notify_community_messages: row?.notify_community_messages !== false,
    notify_message_replies: row?.notify_message_replies !== false,
    notify_new_referral: row?.notify_new_referral !== false,
  };
}

export async function getUserNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data } = await supabaseAdmin
    .from("messaging_preferences")
    .select(
      "in_app_badges, email_major_announcements, notify_official_announcements, notify_community_messages, notify_message_replies, notify_new_referral",
    )
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeNotificationPreferences(data);
}

// ── Envoi groupé aux appareils actifs d'une liste de membres ────────────────
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; deactivated: number }> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return { sent: 0, deactivated: 0 };

  const { data: devices } = await supabaseAdmin
    .from("devices")
    .select("id, user_id, token, platform")
    .in("user_id", uniqueUserIds)
    .eq("is_active", true);

  if (!devices || devices.length === 0) return { sent: 0, deactivated: 0 };

  let sent = 0;
  const staleDeviceIds: string[] = [];

  // Envoi par lots de 20 pour ménager les connexions sortantes
  const BATCH_SIZE = 20;
  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (dev) => {
        try {
          if (dev.platform === "ios") {
            return { id: dev.id, ...(await sendApnsPush(dev.token, payload)) };
          }
          if (dev.platform === "android") {
            return { id: dev.id, ...(await sendFcmPush(dev.token, payload)) };
          }
          return { id: dev.id, ...(await sendWebPush(dev.token, payload)) };
        } catch {
          return { id: dev.id, ok: false, permanentInvalid: false };
        }
      }),
    );

    for (const r of results) {
      if (r.ok) sent++;
      if (r.permanentInvalid) staleDeviceIds.push(r.id);
    }
  }

  if (staleDeviceIds.length > 0) {
    await supabaseAdmin
      .from("devices")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", staleDeviceIds);
  }

  return { sent, deactivated: staleDeviceIds.length };
}

function truncatePushSnippet(text: string, max = 130): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Déclencheur Push pour la messagerie communautaire Winelio :
 * - Ignore les messages automatiques de bienvenue (`welcome`).
 * - Réponse/commentaire : notifie l'auteur du message parent (si `notify_message_replies` activé et salon non en sourdine).
 * - Annonce officielle : notifie les membres ayant un appareil actif (`notify_official_announcements` activé et salon non en sourdine).
 * - Message communauté : notifie les membres ayant un appareil actif (`notify_community_messages` activé et salon non en sourdine).
 */
export async function dispatchCommunityMessagePush(params: {
  channelId: string;
  messageId: string;
  authorId: string;
  authorDisplayName: string;
  messageType: "announcement" | "post" | "welcome";
  title?: string | null;
  content: string;
  hasPhoto?: boolean;
  parentMessageId?: string | null;
  parentAuthorId?: string | null;
}): Promise<{ sent: number }> {
  // Les messages automatiques de bienvenue ne déclenchent pas de push téléphone
  if (params.messageType === "welcome") {
    return { sent: 0 };
  }

  const nowIso = new Date().toISOString();
  const snippet =
    truncatePushSnippet(params.content) ||
    (params.hasPhoto ? "📷 A partagé une photo avec la communauté." : "Nouveau message sur Winelio");

  // Cas 1 : Réponse / commentaire sous un message existant
  if (params.parentMessageId) {
    const recipientId = params.parentAuthorId;
    if (!recipientId || recipientId === params.authorId) {
      return { sent: 0 };
    }

    const [{ data: membership }, prefs] = await Promise.all([
      supabaseAdmin
        .from("messaging_memberships")
        .select("muted_until")
        .eq("channel_id", params.channelId)
        .eq("user_id", recipientId)
        .maybeSingle(),
      getUserNotificationPreferences(recipientId),
    ]);

    if (!prefs.notify_message_replies) return { sent: 0 };
    if (membership?.muted_until && membership.muted_until > nowIso) return { sent: 0 };

    const res = await sendPushToUsers([recipientId], {
      title: `↩️ ${params.authorDisplayName} a répondu à votre message`,
      body: snippet,
      url: "/messages",
      tag: `winelio-reply-${params.parentMessageId}`,
    });
    return { sent: res.sent };
  }

  // Cas 2 : Publication principale (Annonce officielle ou Message communauté)
  // On part uniquement des membres ayant au moins un appareil actif enregistré (rapide même à 50k profils)
  const { data: activeDevices } = await supabaseAdmin
    .from("devices")
    .select("user_id")
    .eq("is_active", true)
    .neq("user_id", params.authorId);

  const candidateIds = Array.from(new Set((activeDevices ?? []).map((d) => d.user_id)));
  if (candidateIds.length === 0) return { sent: 0 };

  const [{ data: activeProfiles }, { data: prefsRows }, { data: mutedRows }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id")
      .in("id", candidateIds)
      .eq("onboarding_status", "active")
      .eq("is_demo", false),
    supabaseAdmin
      .from("messaging_preferences")
      .select("user_id, notify_official_announcements, notify_community_messages")
      .in("user_id", candidateIds),
    supabaseAdmin
      .from("messaging_memberships")
      .select("user_id, muted_until")
      .eq("channel_id", params.channelId)
      .in("user_id", candidateIds)
      .gt("muted_until", nowIso),
  ]);

  const activeSet = new Set((activeProfiles ?? []).map((p) => p.id));
  const mutedSet = new Set((mutedRows ?? []).map((m) => m.user_id));
  const prefMap = new Map(
    (prefsRows ?? []).map((row) => [row.user_id, normalizeNotificationPreferences(row)]),
  );

  const isOfficial = params.messageType === "announcement";
  const eligibleRecipientIds = candidateIds.filter((uid) => {
    if (!activeSet.has(uid) || mutedSet.has(uid)) return false;
    const pref = prefMap.get(uid) ?? DEFAULT_NOTIFICATION_PREFERENCES;
    return isOfficial ? pref.notify_official_announcements : pref.notify_community_messages;
  });

  if (eligibleRecipientIds.length === 0) return { sent: 0 };

  const pushTitle = isOfficial
    ? `📢 ${params.title?.trim() || "Annonce officielle Winelio"}`
    : `💬 ${params.authorDisplayName} · Communauté Winelio`;

  const res = await sendPushToUsers(eligibleRecipientIds, {
    title: pushTitle,
    body: snippet,
    url: isOfficial ? "/messages" : "/dashboard",
    tag: isOfficial ? `winelio-announcement-${params.messageId}` : "winelio-community-post",
  });
  return { sent: res.sent };
}

/**
 * Déclencheur Push dédupliqué pour l'arrivée d'un nouveau filleul (niveaux 1 à 5).
 */
export async function dispatchNewReferralPush(params: {
  newUserId: string;
  sponsorId: string;
  level: number;
  memberName: string;
}): Promise<boolean> {
  const dedupeKey = `new-referral-push:${params.newUserId}:${params.sponsorId}`;

  const { data: existing } = await supabaseAdmin
    .from("push_notification_log")
    .select("dedupe_key")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing) return false;

  const { error: insertErr } = await supabaseAdmin.from("push_notification_log").insert({
    dedupe_key: dedupeKey,
    user_id: params.sponsorId,
    kind: "new_referral",
  });
  if (insertErr) return false;

  const isDirect = params.level === 1;
  const title = isDirect
    ? "🎉 Nouveau filleul direct dans votre réseau !"
    : `🌱 Nouveau membre niveau ${params.level} dans votre réseau`;
  const body = isDirect
    ? `${params.memberName} vient de rejoindre Winelio grâce à votre parrainage.`
    : `${params.memberName} vient de rejoindre votre lignée Winelio (niveau ${params.level}).`;

  const res = await sendPushToUsers([params.sponsorId], {
    title,
    body,
    url: "/network",
    tag: `winelio-referral-${params.newUserId}`,
  });

  return res.sent > 0;
}
