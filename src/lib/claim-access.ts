import { createHmac, timingSafeEqual } from "node:crypto";

export const CLAIM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const claimCookieName = (id: string) => `winelio_claim_${id}`;
const secret = () => process.env.CLAIM_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
const signature = (id: string, expires: string, key: string) =>
  createHmac("sha256", key).update(`winelio:claim:v1:${id}:${expires}`).digest("hex");

export function createClaimProof(id: string, now = Date.now()) {
  const key = secret();
  if (!key || !CLAIM_ID.test(id)) throw new Error("Impossible de préparer le lien de recommandation.");
  const expires = String(Math.floor(now / 1000) + 30 * 86400);
  return `${expires}.${signature(id, expires, key)}`;
}

export function validClaimProof(id: string, proof: unknown, now = Date.now()) {
  const key = secret();
  if (!key || !CLAIM_ID.test(id) || typeof proof !== "string") return false;
  const parts = /^(\d{10})\.([a-f0-9]{64})$/.exec(proof);
  if (!parts || Number(parts[1]) <= Math.floor(now / 1000)) return false;
  return timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(signature(id, parts[1], key), "hex"));
}

export function hasClaimEmail(user: { email?: string; email_confirmed_at?: string | null }, emails: (string | null | undefined)[]) {
  return Boolean(user.email && user.email_confirmed_at && emails.some(email =>
    email && !/@(kiparlo-pro\.fr|winelio-scraped\.local|winko)/i.test(email) && email.trim().toLowerCase() === user.email!.trim().toLowerCase()));
}
