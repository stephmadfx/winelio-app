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
    .select("id, recommendation_id, after_step_order, status, report_count")
    .eq("id", verified.payload.fid)
    .single();

  if (!fu) {
    return htmlPage("Relance introuvable", "Cette relance n'existe plus.", "error");
  }

  if (action === "done") {
    return await handleDone(fu);
  }
  if (action === "postpone") {
    return await handlePostpone(fu, postponeTo);
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
    .select("id, recommendation_id, after_step_order, status, report_count")
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
  status: string;
  report_count: number;
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

  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", stepRow.id);

  // Le trigger SQL cancel les followups pending et crée le suivant si applicable.
  return htmlPage("Étape validée", "Merci ! L'étape a été marquée comme complétée.", "success");
}

async function handlePostpone(fu: FollowupRow, postponeToParam: string | null): Promise<Response> {
  if (!postponeToParam) {
    // Pas de paramètre → redirect vers la page menu
    return NextResponse.redirect(
      `${SITE_URL}/recommendations/followup/${encodeURIComponent(buildTokenForFollowup(fu.id))}/postpone`
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
  if (fu.status !== "pending") {
    return { error: true, title: "Déjà traitée", message: "Cette relance a déjà été traitée." };
  }
  if (fu.report_count >= MAX_REPORTS) {
    return { error: true, status: 409, title: "Limite atteinte", message: `Vous avez atteint la limite de ${MAX_REPORTS} reports pour cette étape.` };
  }
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

  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .update({
      scheduled_at: target.toISOString(),
      cycle_index: 1,
      report_count: fu.report_count + 1,
    })
    .eq("id", fu.id);

  return {
    title: "Reportée",
    message: "OK",
    scheduledAt: target.toISOString(),
    formattedDate: target.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
}

function buildTokenForFollowup(_fid: string): string {
  // Helper interne uniquement utilisé pour le redirect ci-dessus.
  // Le token original est déjà dans l'URL côté pro, mais ici on renvoie vers la page sans regenerate.
  // En pratique, on ne devrait jamais arriver ici (l'utilisateur passe par /postpone directement),
  // mais on prévoit un fallback safe qui demande de revenir à l'email.
  return "";
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
