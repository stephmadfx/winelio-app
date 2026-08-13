import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import { getEmailDisabledReason } from "@/lib/email-environment";
import { buildPendingAccountReminderEmail } from "@/lib/pending-account-reminder-email";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";

const BATCH_SIZE = 50;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const NEXT_REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;

type ReminderRow = {
  user_id: string;
  reminder_count: number;
  next_reminder_at: string;
};

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const disabledReason = getEmailDisabledReason();
  if (disabledReason) {
    return NextResponse.json({ processed: 0, sent: 0, skipped: true, reason: disabledReason });
  }

  const now = new Date();
  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .from("pending_account_reminders")
    .select("user_id, reminder_count, next_reminder_at")
    .eq("status", "pending")
    .not("next_reminder_at", "is", null)
    .lte("next_reminder_at", now.toISOString())
    .order("next_reminder_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const row of (data ?? []) as ReminderRow[]) {
    const reminderNumber = Math.min(row.reminder_count + 1, 3) as 1 | 2 | 3;
    const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString();

    // Réservation optimiste : empêche deux exécutions concurrentes d'envoyer deux fois.
    const { data: claimed } = await supabaseAdmin
      .schema("winelio")
      .from("pending_account_reminders")
      .update({ next_reminder_at: retryAt, updated_at: now.toISOString() })
      .eq("user_id", row.user_id)
      .eq("status", "pending")
      .eq("reminder_count", row.reminder_count)
      .eq("next_reminder_at", row.next_reminder_at)
      .select("user_id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const [{ data: profile }, { data: authData }] = await Promise.all([
        supabaseAdmin.from("profiles")
          .select("id, email, first_name, last_name, sponsor_id, onboarding_status")
          .eq("id", row.user_id).maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(row.user_id),
      ]);

      const user = authData.user;
      if (!profile?.email || profile.onboarding_status !== PENDING_REFERRAL_STATUS ||
          user?.user_metadata?.requires_password_setup !== true) {
        await supabaseAdmin.schema("winelio").from("pending_account_reminders")
          .update({ status: "cancelled", next_reminder_at: null, updated_at: new Date().toISOString() })
          .eq("user_id", row.user_id);
        cancelled++;
        continue;
      }

      const { data: sponsor } = profile.sponsor_id
        ? await supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", profile.sponsor_id).maybeSingle()
        : { data: null };
      const sponsorName = [sponsor?.first_name, sponsor?.last_name].filter(Boolean).join(" ") || "Votre parrain";
      // La séquence peut être exécutée depuis dev2, mais un destinataire ne doit
      // jamais recevoir un lien de préproduction.
      const appUrl = (process.env.PENDING_ACCOUNT_REMINDER_APP_URL || "https://winelio.app").replace(/\/$/, "");
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: `${appUrl}/auth/callback` },
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) throw new Error(linkError?.message || "Jeton d’activation introuvable");

      const confirmLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&setup_password=1`;
      const email = buildPendingAccountReminderEmail({
        reminderNumber,
        firstName: profile.first_name || "",
        sponsorName,
        confirmLink,
      });
      const result = await sendEmail({
        to: profile.email,
        toName: [profile.first_name, profile.last_name].filter(Boolean).join(" "),
        ...email,
      });
      if (!result.ok) throw new Error(result.error || "Échec de l’envoi");

      const isLast = reminderNumber === 3;
      await supabaseAdmin.schema("winelio").from("pending_account_reminders").update({
        reminder_count: reminderNumber,
        last_reminder_at: new Date().toISOString(),
        next_reminder_at: isLast ? null : new Date(Date.now() + NEXT_REMINDER_DELAY_MS).toISOString(),
        status: isLast ? "completed" : "pending",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", row.user_id);
      sent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pending-account-reminders] ${row.user_id}:`, message);
      await supabaseAdmin.schema("winelio").from("pending_account_reminders")
        .update({ last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
    }
  }

  return NextResponse.json({ processed: data?.length ?? 0, sent, cancelled, failed });
}
