// Cron (1x/h) : relance les pros qui ont créé une fiche entreprise mais n'ont
// jamais terminé leur inscription (engagement non signé → invisibles dans la
// recherche). Une seule relance par user, 24 h après la création de la fiche.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyProOnboardingReminder } from "@/lib/notify-pro-onboarding-reminder";

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000; // J+1
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ne pas relancer les fiches > 30 j (antérieures à la feature)

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const reminderCutoff = new Date(now - REMINDER_DELAY_MS).toISOString();
  const maxAgeCutoff = new Date(now - MAX_AGE_MS).toISOString();

  const { data: companies, error } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id, name, created_at, owner:profiles!companies_owner_id_fkey!inner(id, first_name, is_professional)")
    .eq("source", "owner")
    .is("deleted_at", null)
    .eq("owner.is_professional", false)
    .lt("created_at", reminderCutoff)
    .gt("created_at", maxAgeCutoff);

  if (error) {
    console.error("[cron-onboarding-reminder] fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Un pro multi-fiches ne reçoit qu'une relance (et le dedupeKey email_queue
  // garantit une seule relance à vie, même entre exécutions du cron).
  const seenOwners = new Set<string>();
  let queued = 0;

  for (const company of companies ?? []) {
    const owner = Array.isArray(company.owner) ? company.owner[0] : company.owner;
    if (!owner?.id || seenOwners.has(owner.id)) continue;
    seenOwners.add(owner.id);

    try {
      const inserted = await notifyProOnboardingReminder({
        userId: owner.id,
        firstName: owner.first_name ?? null,
        companyName: company.name ?? null,
      });
      if (inserted) queued++;
    } catch (err) {
      console.error(`[cron-onboarding-reminder] échec pour owner=${owner.id}:`, err);
    }
  }

  // Déclencher l'envoi de la file si des emails ont été mis en attente
  if (queued > 0) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app";
    fetch(`${base}/api/email/process-queue`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => undefined);
  }

  return NextResponse.json({ queued, candidates: seenOwners.size, timestamp: new Date(now).toISOString() });
}
