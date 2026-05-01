// src/lib/followup-token.ts
// Tokens HMAC signés pour les actions email de relance pro.
// Format URL : ?token=<base64url(payload)>.<signature>
// Payload : { fid: <followup_id>, exp: <epoch_seconds>, v: 1 }

import crypto from "crypto";

const SECRET = process.env.FOLLOWUP_ACTION_SECRET;
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours
const VERSION = 1;

function getSecret(): string {
  if (!SECRET || SECRET.length < 32) {
    throw new Error("FOLLOWUP_ACTION_SECRET manquant ou trop court (min 32 chars)");
  }
  return SECRET;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export interface FollowupPayload {
  fid: string;
  exp: number;
  v: number;
}

export function signFollowupToken(followupId: string): string {
  const payload: FollowupPayload = {
    fid: followupId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    v: VERSION,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export type VerifyResult =
  | { ok: true; payload: FollowupPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_version" };

export function verifyFollowupToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  const providedSig = b64urlDecode(sigB64);
  if (expectedSig.length !== providedSig.length ||
      !crypto.timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: FollowupPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.v !== VERSION) return { ok: false, reason: "wrong_version" };
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (typeof payload.fid !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.fid)) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, payload };
}
