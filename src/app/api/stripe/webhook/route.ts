import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCommissions } from "@/lib/commission";
import { notifyReferrerCommissionCredited } from "@/lib/notify-commission-credited";
import { unlockRecommendationCommissions } from "@/lib/recommendation-review";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret non configuré" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  if (![
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ].includes(event.type)) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const recommendationId = session.metadata?.recommendation_id;

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendation_id absent" }, { status: 400 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, skipped: "payment_not_paid" });
  }

  // ── Idempotence : vérifier que la session n'est pas déjà payée ───────────────
  const { data: paymentSession } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, status, amount")
    .eq("stripe_session_id", session.id)
    .single();

  if (!paymentSession) {
    return NextResponse.json({ error: "Session introuvable en DB" }, { status: 404 });
  }

  if (paymentSession.status === "paid") {
    const payout = await unlockRecommendationCommissions(recommendationId);
    return NextResponse.json({ received: true, reconciled: "already_paid", payout });
  }

  // ── Récupérer la recommandation ──────────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id, professional_id, amount, compensation_plan_id")
    .eq("id", recommendationId)
    .single();

  if (!reco) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }
  if (reco.amount == null) {
    return NextResponse.json({ error: "Recommandation sans montant" }, { status: 400 });
  }

  // ── Créer les commissions puis débloquer ce qui est payable ─────────────────
  // La commission directe du recommandeur reste en attente tant que son avis
  // qualifié n'a pas été déposé.
  await createCommissions(
    reco.id,
    reco.referrer_id,
    reco.professional_id,
    reco.amount,
    reco.compensation_plan_id ?? null
  );

  // ── Marquer la session comme payée ───────────────────────────────────────────
  const { data: markedPaid, error: paymentUpdateError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentSession.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (paymentUpdateError) {
    throw new Error(`Échec marquage paiement Stripe: ${paymentUpdateError.message}`);
  }
  if (!markedPaid) {
    const payout = await unlockRecommendationCommissions(recommendationId);
    return NextResponse.json({ received: true, reconciled: "concurrent_webhook", payout });
  }

  const payout = await unlockRecommendationCommissions(reco.id);

  await notifyReferrerCommissionCredited(reco.id).catch((err) =>
    console.error("[stripe-webhook] Échec notification cagnotte:", err)
  );

  return NextResponse.json({ received: true, payout });
}
