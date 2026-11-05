// Relance "reco sans mouvement" : règles d'éligibilité + token HMAC des liens du mail.
// Module pur (aucun accès base) pour rester testable. Indépendant de followup-token.ts.
import crypto from "crypto";

export const REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;  // PENDING depuis 3 jours
export const MAX_RECO_AGE_MS = 180 * 24 * 60 * 60 * 1000;  // rattrapage : recos PENDING des 6 derniers mois
const TTL_SECONDS = 30 * 24 * 60 * 60;

const PLACEHOLDER_EMAIL_RE = /@(kiparlo-pro\.fr|winelio-scraped\.local|winko)/i;
const DEMO_REFERRER_RE = /@(winelio-demo\.internal|demo-winelio\.fr)$/i;

type CompanyRow = { source: string | null; email: string | null; deleted_at: string | null };

export interface ReminderCandidate {
  status: string | null;
  pending_reminder_sent_at: string | null;
  email_opened_at: string | null;
  referrerEmail: string | null;
  proEmail: string | null;
  proOptedOut: boolean;
  company: CompanyRow | null;
}

const isPlaceholder = (e: string | null | undefined) => !!e && PLACEHOLDER_EMAIL_RE.test(e);

/** Adresses valides du pro (même règle que notify-new-recommendation). */
export function reminderRecipients(proEmail: string | null, company: CompanyRow | null): string[] {
  const list = [company?.email, proEmail].filter((e): e is string => !!e && !isPlaceholder(e));
  return [...new Set(list)];
}

export function isReminderEligible(c: ReminderCandidate): boolean {
  if (c.status !== "PENDING") return false;
  if (c.pending_reminder_sent_at) return false;
  if (c.proOptedOut) return false;
  if (DEMO_REFERRER_RE.test(c.referrerEmail ?? "")) return false;
  // Pro scrapé qui n'a jamais ouvert le mail : déjà géré par cron-scraped-reminder, on ne double pas.
  if (c.company?.source === "scraped" && !c.email_opened_at) return false;
  return reminderRecipients(c.proEmail, c.company).length > 0;
}

// ── Token HMAC (payload { rid, exp, v, k }) ─────────────────────────────────
const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4), "base64");

function secret(): string {
  const s = process.env.FOLLOWUP_ACTION_SECRET?.replace(/\s/g, "");
  if (!s || s.length < 32) throw new Error("FOLLOWUP_ACTION_SECRET manquant ou trop court (min 32 chars)");
  return s;
}

export function signReminderToken(recommendationId: string): string {
  const payload = b64(Buffer.from(JSON.stringify({
    rid: recommendationId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS, v: 1, k: "pending-reminder",
  })));
  return `${payload}.${b64(crypto.createHmac("sha256", secret()).update(payload).digest())}`;
}

export function verifyReminderToken(token: string): { ok: true; rid: string } | { ok: false } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false };
  const expected = crypto.createHmac("sha256", secret()).update(parts[0]).digest();
  const given = unb64(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false };
  try {
    const p = JSON.parse(unb64(parts[0]).toString("utf8"));
    if (p.k !== "pending-reminder" || p.v !== 1) return { ok: false };
    if (typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return { ok: false };
    if (typeof p.rid !== "string" || !/^[0-9a-f-]{36}$/i.test(p.rid)) return { ok: false };
    return { ok: true, rid: p.rid };
  } catch {
    return { ok: false };
  }
}
