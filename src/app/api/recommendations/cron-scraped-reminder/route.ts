import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyScrapedReminder } from "@/lib/notify-scraped-reminder";
import { notifyReferrerNoResponse } from "@/lib/notify-referrer-no-response";

const REMINDER_DELAY_MS     = 12 * 60 * 60 * 1000; // 12h après création → relance pro
const NO_RESPONSE_DELAY_MS  = 24 * 60 * 60 * 1000; // 24h après relance  → alerte referrer

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // ── 1. Relance pro (H+12) ─────────────────────────────────────────────────
  const reminderCutoff = new Date(now.getTime() - REMINDER_DELAY_MS).toISOString();
  const { data: toRemind, error: remindErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(`id, professional:profiles!recommendations_professional_id_fkey(companies(source))`)
    .eq("status", "PENDING")
    .is("email_opened_at", null)
    .is("scraped_reminder_sent_at", null)
    .lt("created_at", reminderCutoff);

  if (remindErr) {
    console.error("[cron-scraped-reminder] Erreur relances:", remindErr);
    return NextResponse.json({ error: remindErr.message }, { status: 500 });
  }

  let reminders = 0;
  for (const rec of toRemind ?? []) {
    try {
      const pro = Array.isArray(rec.professional) ? rec.professional[0] : rec.professional;
      const company = Array.isArray(pro?.companies) ? pro.companies[0] : pro?.companies;
      if ((company as { source?: string | null } | null)?.source !== "scraped") continue;

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
    .select(`id`)
    .eq("status", "PENDING")
    .is("email_opened_at", null)
    .not("scraped_reminder_sent_at", "is", null)
    .lt("scraped_reminder_sent_at", noResponseCutoff)
    .is("referrer_no_response_notified_at", null);

  if (alertErr) {
    console.error("[cron-scraped-reminder] Erreur alertes referrer:", alertErr);
    return NextResponse.json({ error: alertErr.message }, { status: 500 });
  }

  let alerts = 0;
  for (const rec of toAlert ?? []) {
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
