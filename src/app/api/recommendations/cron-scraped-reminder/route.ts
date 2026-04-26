import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyScrapedReminder } from "@/lib/notify-scraped-reminder";

const DELAY_MS = 12 * 60 * 60 * 1000; // 12h après l'envoi du premier email

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - DELAY_MS).toISOString();

  // Recos PENDING pour pros scrappés, premier email non ouvert, relance pas encore envoyée
  const { data: recos, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, created_at,
       professional:profiles!recommendations_professional_id_fkey(companies(source))`
    )
    .eq("status", "PENDING")
    .is("email_opened_at", null)
    .is("scraped_reminder_sent_at", null)
    .lt("created_at", cutoff);

  if (error) {
    console.error("[cron-scraped-reminder] Erreur requête:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  const now = new Date().toISOString();

  for (const rec of recos ?? []) {
    try {
      const pro = Array.isArray(rec.professional) ? rec.professional[0] : rec.professional;
      const company = Array.isArray(pro?.companies) ? pro.companies[0] : pro?.companies;
      if ((company as { source?: string | null } | null)?.source !== "scraped") continue;

      await notifyScrapedReminder(rec.id);

      await supabaseAdmin
        .schema("winelio")
        .from("recommendations")
        .update({ scraped_reminder_sent_at: now })
        .eq("id", rec.id);

      sent++;
    } catch (err) {
      console.error(`[cron-scraped-reminder] Erreur reco ${rec.id}:`, err);
    }
  }

  // Déclencher le process-queue email si des relances ont été mises en file
  if (sent > 0) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app";
    fetch(`${base}/api/email/process-queue`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ sent, timestamp: now });
}
