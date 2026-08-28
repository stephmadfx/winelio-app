import crypto from "node:crypto";

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Signe un token de relance identique à `src/lib/followup-token.ts`.
 * Le secret doit matcher celui du serveur ciblé (FOLLOWUP_ACTION_SECRET).
 */
export function signFollowupToken(followupId: string): string {
  const secret = process.env.FOLLOWUP_ACTION_SECRET?.replace(/\s/g, "") ?? "";
  if (secret.length < 32) {
    throw new Error("FOLLOWUP_ACTION_SECRET manquant ou trop court pour signer le token E2E");
  }
  const payload = JSON.stringify({
    fid: followupId,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    v: 1,
  });
  const payloadB64 = b64urlEncode(Buffer.from(payload, "utf8"));
  const sigB64 = b64urlEncode(crypto.createHmac("sha256", secret).update(payloadB64).digest());
  return `${payloadB64}.${sigB64}`;
}
