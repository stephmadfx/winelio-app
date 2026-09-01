import crypto from "crypto";

const SECRET = (
  process.env.CLIENT_RECOMMENDATION_ACTION_SECRET ||
  process.env.FOLLOWUP_ACTION_SECRET ||
  ""
).replace(/\s/g, "");
const VERSION = 1;
const DOMAIN = "winelio-client-recommendation-action-v1";

export type ClientActionPurpose = "quote" | "completion";

export interface ClientRecommendationPayload {
  rid: string;
  purpose: ClientActionPurpose;
  tokenVersion: number;
  exp: number;
  v: number;
}

export type ClientTokenVerifyResult =
  | { ok: true; payload: ClientRecommendationPayload }
  | {
      ok: false;
      reason: "malformed" | "bad_signature" | "expired" | "wrong_version";
    };

function getSecret(): string {
  if (!SECRET || SECRET.length < 32) {
    throw new Error(
      "CLIENT_RECOMMENDATION_ACTION_SECRET/FOLLOWUP_ACTION_SECRET manquant ou trop court (min 32 chars)",
    );
  }
  return SECRET;
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function signature(payloadB64: string): Buffer {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${DOMAIN}.${payloadB64}`)
    .digest();
}

export function signClientRecommendationToken(params: {
  recommendationId: string;
  purpose: ClientActionPurpose;
  tokenVersion: number;
  expiresAt: string | Date;
}): string {
  const expiresAt =
    params.expiresAt instanceof Date
      ? params.expiresAt
      : new Date(params.expiresAt);
  const payload: ClientRecommendationPayload = {
    rid: params.recommendationId,
    purpose: params.purpose,
    tokenVersion: params.tokenVersion,
    exp: Math.floor(expiresAt.getTime() / 1000),
    v: VERSION,
  };
  const payloadB64 = encode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${encode(signature(payloadB64))}`;
}

export function verifyClientRecommendationToken(
  token: string,
): ClientTokenVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  const [payloadB64, signatureB64] = parts;
  let providedSignature: Buffer;
  try {
    providedSignature = decode(signatureB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expectedSignature = signature(payloadB64);
  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ClientRecommendationPayload;
  try {
    payload = JSON.parse(decode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.v !== VERSION) return { ok: false, reason: "wrong_version" };
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return { ok: false, reason: "expired" };
  }
  if (
    typeof payload.rid !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payload.rid) ||
    !["quote", "completion"].includes(payload.purpose) ||
    !Number.isInteger(payload.tokenVersion) ||
    payload.tokenVersion < 1
  ) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, payload };
}
