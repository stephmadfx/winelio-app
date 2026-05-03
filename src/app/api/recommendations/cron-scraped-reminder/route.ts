import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyScrapedReminder } from "@/lib/notify-scraped-reminder";
import { notifyReferrerNoResponse } from "@/lib/notify-referrer-no-response";

const REMINDER_DELAY_MS     = 12 * 60 * 60 * 1000;          // 12h après création → relance pro
const NO_RESPONSE_DELAY_MS  = 24 * 60 * 60 * 1000;          // 24h après relance  → alerte referrer
const MAX_RECO_AGE_MS       = 7  * 24 * 60 * 60 * 1000;     // garde-fou anti-rétroactif

const PLACEHOLDER_EMAIL_RE = /@(kiparlo-pro\.fr|winelio-scraped\.local|winko)/i;
const DEMO_REFERRER_RE     = /@(winelio-demo\.internal|demo-winelio\.fr)$/i;

const isPlaceholderEmail = (e: string | null | undefined) => !!e && PLACEHOLDER_EMAIL_RE.test(e);
const isDemoReferrer     = (e: string | null | undefined) => !!e && DEMO_REFERRER_RE.test(e);

type CompanyRow = { source: string | null; email: string | null };
type ProfileRow  = { email: string | null };
type ProRow      = { companies: CompanyRow | CompanyRow[] | null };
type Joined = {
  id: string;
  referrer: ProfileRow | ProfileRow[] | null;
  professional: ProRow | ProRow[] | null;
};

const pickOne = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Une reco scrapée est éligible aux notifications cron si :
 *  - la company est bien scraped
 *  - elle a un email réel (pas null, pas placeholder)
 *  - le referrer n'est pas un compte démo
 * Sinon : on n'a pas pu / on ne veut pas notifier le pro, donc inutile de faire suivre au referrer.
 */
function isEligible(rec: Joined): boolean {
  const referrer = pickOne(rec.referrer);
  if (isDemoReferrer(referrer?.email)) return false;

  const pro = pickOne(rec.professional);
  const company = pickOne(pro?.companies);
  if (company?.source !== "scraped") return false;
  if (!company.email || isPlaceholderEmail(company.email)) return false;

  return true;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const maxAgeCutoff = new Date(now.getTime() - MAX_RECO_AGE_MS).toISOString();

  const joinedSelect = `
    id,
    referrer:profiles!recommendations_referrer_id_fkey(email),
    professional:profiles!recommendations_professional_id_fkey(companies(source, email))
  `;

  // ── 1. Relance pro (H+12) ─────────────────────────────────────────────────
  const reminderCutoff = new Date(now.getTime() - REMINDER_DELAY_MS).toISOString();
  const { data: toRemind, error: remindErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(joinedSelect)
    .eq("status", "PENDING")
    .is("email_opened_at", null)
    .is("scraped_reminder_sent_at", null)
    .lt("created_at", reminderCutoff)
    .gt("created_at", maxAgeCutoff);

  if (remindErr) {
    console.error("[cron-scraped-reminder] Erreur relances:", remindErr);
    return NextResponse.json({ error: remindErr.message }, { status: 500 });
  }

  let reminders = 0;
  for (const rec of (toRemind ?? []) as unknown as Joined[]) {
    if (!isEligible(rec)) continue;
    try {
      await notifyScrapedReminder(rec.id);
      await supabaseAdmin.schema("winelio").from("recommendations")
        .update({ scraped_reminder_sent_at: nowIso }).eq("id", rec.id);
      reminders++;
    } catch (err) {
      console.error(`[cron-scraped-reminder] Erreur relance reco ${rec.id}:`, err);
    }
  }

  // ── 2. Alerte referrer (H+36 = 24h après la relance) ────────────────────
  const noResponseCutoff = new Date(now.getTime() - NO_RESPONSE_DELAY_MS).toISOString();
  const { data: toAlert, error: alertErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(joinedSelect)
    .eq("status", "PENDING")
    .is("email_opened_at", null)
    .not("scraped_reminder_sent_at", "is", null)
    .lt("scraped_reminder_sent_at", noResponseCutoff)
    .is("referrer_no_response_notified_at", null)
    .gt("created_at", maxAgeCutoff);

  if (alertErr) {
    console.error("[cron-scraped-reminder] Erreur alertes referrer:", alertErr);
    return NextResponse.json({ error: alertErr.message }, { status: 500 });
  }

  let alerts = 0;
  for (const rec of (toAlert ?? []) as unknown as Joined[]) {
    if (!isEligible(rec)) continue;
    try {
      await notifyReferrerNoResponse(rec.id);
      await supabaseAdmin.schema("winelio").from("recommendations")
        .update({ referrer_no_response_notified_at: nowIso }).eq("id", rec.id);
      alerts++;
    } catch (err) {
      console.error(`[cron-scraped-reminder] Erreur alerte referrer reco ${rec.id}:`, err);
    }
  }

  // Déclencher le process-queue si des emails ont été mis en file
  if (reminders + alerts > 0) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app";
    fetch(`${base}/api/email/process-queue`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ reminders, alerts, timestamp: nowIso });
}
