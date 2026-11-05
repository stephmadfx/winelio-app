// Cron quotidien : relance le pro dont la reco est restée PENDING depuis 3 jours (une seule fois),
// jusqu'à 6 mois en arrière, 50 mails max par passage.
// Ne touche ni à cron-scraped-reminder ni à process-followups.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEmailDisabledReason } from "@/lib/email-environment";
import { notifyPendingReminder } from "@/lib/notify-pending-reminder";
import { pickActiveCompany } from "@/lib/pick-active-company";
import { isReminderEligible, MAX_RECO_AGE_MS, REMINDER_AFTER_MS } from "@/lib/pending-reminder";

const SCAN_LIMIT = 500; // les inéligibles (non marquées) ne doivent pas bloquer les suivantes
const MAX_PER_RUN = 50; // étalement : protège la file d'e-mails et la réputation d'envoi

const norm = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T | null));

async function run(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const disabledReason = getEmailDisabledReason();
  if (disabledReason) {
    console.warn(`[cron-pending-reminder] ignoré: ${disabledReason}`);
    return NextResponse.json({ reminders: 0, skipped: true, reason: disabledReason });
  }

  const now = Date.now();
  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, pending_reminder_sent_at, email_opened_at,
       referrer:profiles!recommendations_referrer_id_fkey(email),
       professional:profiles!recommendations_professional_id_fkey(email, reco_reminders_opt_out_at, companies(source, email, deleted_at))`
    )
    .eq("status", "PENDING")
    .is("pending_reminder_sent_at", null)
    .lt("created_at", new Date(now - REMINDER_AFTER_MS).toISOString())
    .gt("created_at", new Date(now - MAX_RECO_AGE_MS).toISOString())
    .order("created_at", { ascending: false }) // les plus récentes d'abord, le rattrapage s'écoule ensuite
    .limit(SCAN_LIMIT);

  if (error) {
    console.error("[cron-pending-reminder]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let reminders = 0;
  for (const rec of data ?? []) {
    if (reminders >= MAX_PER_RUN) break;
    const referrer = norm<{ email: string | null }>(rec.referrer);
    const pro = norm<{ email: string | null; reco_reminders_opt_out_at: string | null; companies: unknown }>(rec.professional);
    const company = pickActiveCompany<{ source: string | null; email: string | null; deleted_at: string | null }>(pro?.companies);

    if (!isReminderEligible({
      status: rec.status,
      pending_reminder_sent_at: rec.pending_reminder_sent_at,
      email_opened_at: rec.email_opened_at,
      referrerEmail: referrer?.email ?? null,
      proEmail: pro?.email ?? null,
      proOptedOut: !!pro?.reco_reminders_opt_out_at,
      company,
    })) continue;

    try {
      if (await notifyPendingReminder(rec.id)) {
        await supabaseAdmin.schema("winelio").from("recommendations")
          .update({ pending_reminder_sent_at: new Date().toISOString() }).eq("id", rec.id);
        reminders++;
      }
    } catch (err) {
      console.error(`[cron-pending-reminder] reco ${rec.id}:`, err);
    }
  }

  if (reminders > 0) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app";
    fetch(`${base}/api/email/process-queue`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ reminders });
}

export const GET = run;
export const POST = run;
