// src/app/api/recommendations/process-followups/route.ts
// Cron worker (toutes les 15 min) qui scanne les followups pending échus
// et envoie la relance email correspondante.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyProFollowup } from "@/lib/notify-pro-followup";
import { notifyProAbandoned } from "@/lib/notify-pro-abandoned";

const BATCH_SIZE = 50;
const DELAY_CYCLE_2_HOURS = 48;
const DELAY_CYCLE_3_DAYS = 5;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: pending, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, cycle_index")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[process-followups] fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const fu of pending) {
    try {
      const reason = await checkCancelReason(fu.recommendation_id, fu.after_step_order);
      if (reason) {
        await supabaseAdmin
          .schema("winelio")
          .from("recommendation_followups")
          .update({ status: "cancelled", cancel_reason: reason })
          .eq("id", fu.id);
        cancelled++;
        continue;
      }

      const emailQueueId = await notifyProFollowup({
        followupId: fu.id,
        recommendationId: fu.recommendation_id,
        afterStep: fu.after_step_order as 2 | 4 | 5,
        cycleIndex: fu.cycle_index as 1 | 2 | 3,
      });

      await supabaseAdmin
        .schema("winelio")
        .from("recommendation_followups")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          email_queue_id: emailQueueId,
        })
        .eq("id", fu.id);

      // Programmer la relance suivante OU déclencher l'abandon
      if (fu.cycle_index < 3) {
        const nextDelay = fu.cycle_index === 1
          ? DELAY_CYCLE_2_HOURS * 60 * 60 * 1000
          : DELAY_CYCLE_3_DAYS * 24 * 60 * 60 * 1000;
        const nextAt = new Date(Date.now() + nextDelay).toISOString();

        await supabaseAdmin
          .schema("winelio")
          .from("recommendation_followups")
          .insert({
            recommendation_id: fu.recommendation_id,
            after_step_order: fu.after_step_order,
            cycle_index: fu.cycle_index + 1,
            scheduled_at: nextAt,
          });
      } else {
        // Cycle 3 envoyé → marquer la reco comme abandonnée + notifier le referrer
        await supabaseAdmin
          .schema("winelio")
          .from("recommendations")
          .update({ abandoned_by_pro_at: new Date().toISOString() })
          .eq("id", fu.recommendation_id)
          .is("abandoned_by_pro_at", null);

        await notifyProAbandoned(fu.recommendation_id);
      }

      sent++;
    } catch (err) {
      console.error(`[process-followups] erreur followup ${fu.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ processed: pending.length, sent, cancelled, failed });
}

async function checkCancelReason(
  recommendationId: string,
  afterStepOrder: number
): Promise<string | null> {
  // Reco refusée / transférée / abandonnée ?
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("status")
    .eq("id", recommendationId)
    .single();

  if (!rec) return "reco_deleted";
  if (rec.status === "CANCELLED") return "reco_refused";
  if (rec.status === "TRANSFERRED") return "reco_transferred";

  // Une étape > afterStepOrder déjà complétée ?
  const { data: laterSteps } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", recommendationId)
    .not("completed_at", "is", null);

  if (laterSteps?.some((s) => {
    const step = Array.isArray(s.step) ? s.step[0] : s.step;
    return (step?.order_index ?? 0) > afterStepOrder;
  })) {
    return "next_step_done";
  }

  return null;
}
