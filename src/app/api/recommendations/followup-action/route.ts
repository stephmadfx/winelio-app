// src/app/api/recommendations/followup-action/route.ts
// Endpoint appelé par les boutons des emails de relance.
// Token HMAC signé, pas de session Supabase requise.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyFollowupToken } from "@/lib/followup-token";

const MAX_REPORTS = 5;
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const postponeTo = url.searchParams.get("postpone_to");

  const verified = verifyFollowupToken(token);
  if (!verified.ok) {
    return htmlPage("Lien expiré", `Ce lien a expiré ou est invalide. Connectez-vous à votre tableau de bord pour mettre à jour vos recommandations.`, "error");
  }

  const { data: fu } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, cycle_index, status, report_count, cancel_reason")
    .eq("id", verified.payload.fid)
    .single();

  if (!fu) {
    return htmlPage("Relance introuvable", "Cette relance n'existe plus.", "error");
  }

  if (action === "done") {
    return await handleDone(fu);
  }
  if (action === "postpone") {
    return await handlePostpone(fu, postponeTo, token);
  }
  if (action === "abandon") {
    // GET /abandon est juste un redirect vers la page de confirmation
    return NextResponse.redirect(`${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/abandon`);
  }

  return htmlPage("Action invalide", "Action non reconnue.", "error");
}

// POST utilisé par les pages publiques (postpone confirmé / abandon confirmé)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = body.token ?? "";
  const action = body.action ?? "";
  const postponeTo = body.postpone_to ?? null;

  const verified = verifyFollowupToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: "Token invalide ou expiré" }, { status: 400 });
  }

  const { data: fu } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, recommendation_id, after_step_order, cycle_index, status, report_count, cancel_reason")
    .eq("id", verified.payload.fid)
    .single();

  if (!fu) {
    return NextResponse.json({ error: "Relance introuvable" }, { status: 404 });
  }

  if (action === "postpone") {
    return await postJsonPostpone(fu, postponeTo);
  }
  if (action === "abandon") {
    return await postJsonAbandon(fu);
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}

interface FollowupRow {
  id: string;
  recommendation_id: string;
  after_step_order: number;
  cycle_index: number;
  status: string;
  report_count: number;
  cancel_reason: string | null;
}

async function handleDone(fu: FollowupRow): Promise<Response> {
  // Trouver l'étape à compléter (after_step_order + 1)
  const targetOrder = fu.after_step_order + 1;

  const { data: stepRow } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select("id, completed_at, step:steps!inner(order_index)")
    .eq("recommendation_id", fu.recommendation_id)
    .eq("step.order_index", targetOrder)
    .single();

  if (!stepRow) {
    return htmlPage("Étape introuvable", "Cette étape n'existe plus pour cette recommandation.", "error");
  }
  if (stepRow.completed_at) {
    return htmlPage("Déjà fait, merci", "Cette étape a déjà été marquée comme complétée. Merci !", "success");
  }

  const actionability = await ensureRecommendationCanStillMove(fu);
  if (!actionability.ok) {
    return htmlPage(actionability.title, actionability.message, "error");
  }

  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", stepRow.id);

  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ abandoned_by_pro_at: null })
    .eq("id", fu.recommendation_id);

  // Le trigger SQL cancel les followups pending et crée le suivant si applicable.
  return htmlPage("Étape validée", "Merci ! L'étape a été marquée comme complétée.", "success");
}

async function handlePostpone(fu: FollowupRow, postponeToParam: string | null, token: string): Promise<Response> {
  if (!postponeToParam) {
    // Pas de paramètre → redirect vers la page menu
    return NextResponse.redirect(
      `${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/postpone`
    );
  }
  const result = await applyPostpone(fu, postponeToParam);
  if (result.error) return htmlPage(result.title, result.message, "error");
  return htmlPage("Relance reportée", `Nous reviendrons vers vous le ${result.formattedDate}.`, "success");
}

async function postJsonPostpone(fu: FollowupRow, postponeToParam: string | null): Promise<Response> {
  if (!postponeToParam) return NextResponse.json({ error: "postpone_to manquant" }, { status: 400 });
  const result = await applyPostpone(fu, postponeToParam);
  if (result.error) return NextResponse.json({ error: result.message }, { status: result.status ?? 400 });
  return NextResponse.json({ ok: true, scheduled_at: result.scheduledAt });
}

async function postJsonAbandon(fu: FollowupRow): Promise<Response> {
  // Marquer la reco comme refusée (statut CANCELLED, aligné sur /refuse)
  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ status: "CANCELLED" })
    .eq("id", fu.recommendation_id);

  // Cancel tous les followups pending de cette reco
  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .update({ status: "cancelled", cancel_reason: "reco_refused" })
    .eq("recommendation_id", fu.recommendation_id)
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}

interface PostponeResult {
  error?: boolean;
  status?: number;
  title: string;
  message: string;
  scheduledAt?: string;
  formattedDate?: string;
}

async function applyPostpone(fu: FollowupRow, postponeToParam: string): Promise<PostponeResult> {
  const target = new Date(postponeToParam);
  if (isNaN(target.getTime())) {
    return { error: true, title: "Date invalide", message: "Date invalide." };
  }
  const nowMs = Date.now();
  const minMs = nowMs + 60 * 60 * 1000;          // +1h
  const maxMs = nowMs + 365 * 24 * 60 * 60 * 1000; // +1 an
  if (target.getTime() < minMs || target.getTime() > maxMs) {
    return { error: true, title: "Date hors limites", message: "La date doit être comprise entre +1h et +1 an." };
  }

  const actionability = await ensureRecommendationCanStillMove(fu);
  if (!actionability.ok) {
    return actionability;
  }

  const postponable = await resolvePostponableFollowup(fu);
  if ("error" in postponable) {
    return postponable;
  }

  if (postponable.reportCount >= MAX_REPORTS) {
    return { error: true, status: 409, title: "Limite atteinte", message: `Vous avez atteint la limite de ${MAX_REPORTS} reports pour cette étape.` };
  }

  const nextReportCount = postponable.reportCount + 1;
  const scheduledAt = target.toISOString();

  if (postponable.kind === "update") {
    const { error } = await supabaseAdmin
      .schema("winelio")
      .from("recommendation_followups")
      .update({
        scheduled_at: scheduledAt,
        cycle_index: 1,
        report_count: nextReportCount,
        cancel_reason: null,
      })
      .eq("id", postponable.id)
      .eq("status", "pending");

    if (error) {
      return { error: true, status: 500, title: "Erreur", message: "Impossible de reporter cette relance pour le moment." };
    }
  } else {
    const { error } = await supabaseAdmin
      .schema("winelio")
      .from("recommendation_followups")
      .insert({
        recommendation_id: fu.recommendation_id,
        after_step_order: fu.after_step_order,
        cycle_index: 1,
        scheduled_at: scheduledAt,
        report_count: nextReportCount,
      });

    if (error) {
      return { error: true, status: 500, title: "Erreur", message: "Impossible de reprogrammer cette relance pour le moment." };
    }
  }

  if (fu.status !== "pending" && (fu.status === "sent" || fu.status === "superseded" || fu.cancel_reason === "pro_abandoned")) {
    await supabaseAdmin
      .schema("winelio")
      .from("recommendation_followups")
      .update({ status: "superseded", cancel_reason: "postponed" })
      .eq("id", fu.id)
      .in("status", ["sent", "superseded", "cancelled"]);
  }

  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ abandoned_by_pro_at: null })
    .eq("id", fu.recommendation_id);

  return {
    title: "Reportée",
    message: "OK",
    scheduledAt,
    formattedDate: target.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
}

type ActionabilityResult =
  | { ok: true }
  | { ok: false; error: true; status?: number; title: string; message: string };

async function ensureRecommendationCanStillMove(fu: FollowupRow): Promise<ActionabilityResult> {
  if (fu.status === "cancelled" && fu.cancel_reason !== "pro_abandoned") {
    return {
      ok: false,
      error: true,
      status: 409,
      title: "Relance annulée",
      message: messageForCancelReason(fu.cancel_reason),
    };
  }

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("status")
    .eq("id", fu.recommendation_id)
    .single();

  if (!rec) {
    return { ok: false, error: true, status: 404, title: "Recommandation introuvable", message: "Cette recommandation n'existe plus." };
  }
  if (rec.status === "CANCELLED") {
    return { ok: false, error: true, status: 409, title: "Recommandation annulée", message: "Cette recommandation a été annulée." };
  }
  if (rec.status === "TRANSFERRED") {
    return { ok: false, error: true, status: 409, title: "Recommandation transférée", message: "Cette recommandation a déjà été transférée." };
  }

  const { data: laterSteps } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select("id, step:steps(order_index)")
    .eq("recommendation_id", fu.recommendation_id)
    .not("completed_at", "is", null);

  const hasLaterStepDone = laterSteps?.some((row) => {
    const step = Array.isArray(row.step) ? row.step[0] : row.step;
    return (step?.order_index ?? 0) > fu.after_step_order;
  });

  if (hasLaterStepDone) {
    return {
      ok: false,
      error: true,
      status: 409,
      title: "Étape déjà avancée",
      message: "Cette recommandation a déjà avancé depuis cette relance.",
    };
  }

  return { ok: true };
}

type PostponableFollowup =
  | { kind: "update"; id: string; reportCount: number }
  | { kind: "insert"; reportCount: number }
  | { error: true; status?: number; title: string; message: string };

async function resolvePostponableFollowup(fu: FollowupRow): Promise<PostponableFollowup> {
  if (fu.status === "pending") {
    return { kind: "update", id: fu.id, reportCount: fu.report_count };
  }

  const canUseEmailLink =
    fu.status === "sent" ||
    fu.status === "superseded" ||
    (fu.status === "cancelled" && fu.cancel_reason === "pro_abandoned");

  if (!canUseEmailLink) {
    return { error: true, status: 409, title: "Déjà traitée", message: "Cette relance a déjà été traitée." };
  }

  const { data: pending, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, report_count")
    .eq("recommendation_id", fu.recommendation_id)
    .eq("after_step_order", fu.after_step_order)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: true, status: 500, title: "Erreur", message: "Impossible de retrouver la prochaine relance." };
  }

  if (pending) {
    return { kind: "update", id: pending.id, reportCount: pending.report_count };
  }

  return { kind: "insert", reportCount: fu.report_count };
}

function messageForCancelReason(reason: string | null): string {
  if (reason === "next_step_done") return "L'étape suivante a déjà été complétée.";
  if (reason === "reco_refused") return "Cette recommandation a été refusée.";
  if (reason === "reco_transferred") return "Cette recommandation a été transférée.";
  if (reason === "pro_abandoned") return "Le cycle de relance est déjà terminé.";
  return "Cette relance n'est plus active.";
}

function htmlPage(title: string, message: string, variant: "success" | "error"): Response {
  const color = variant === "success" ? "#16a34a" : "#dc2626";
  const icon = variant === "success" ? "✅" : "⚠️";
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:480px;margin:60px auto;padding:40px;background:#fff;border-radius:16px;text-align:center;">
  <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
  <h1 style="color:${color};font-size:22px;margin:0 0 12px;">${title}</h1>
  <p style="color:#636E72;font-size:15px;line-height:1.6;margin:0 0 24px;">${message}</p>
  <a href="${SITE_URL}" style="display:inline-block;color:#FF6B35;text-decoration:underline;font-size:14px;">Aller sur Winelio</a>
</div>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
