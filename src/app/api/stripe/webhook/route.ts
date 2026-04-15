import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCommissions } from "@/lib/commission";
import { recalculateWallet } from "@/lib/wallet";
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

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const recommendationId = session.metadata?.recommendation_id;

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendation_id absent" }, { status: 400 });
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
    return NextResponse.json({ received: true, skipped: "already_paid" });
  }

  // ── Récupérer la recommandation ──────────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id, professional_id, amount, compensation_plan_id")
    .eq("id", recommendationId)
    .single();

  if (!reco?.amount) {
    return NextResponse.json({ error: "Recommandation introuvable ou sans montant" }, { status: 404 });
  }

  // ── Créer et distribuer les commissions ──────────────────────────────────────
  await createCommissions(
    reco.id,
    reco.referrer_id,
    reco.professional_id,
    reco.amount,
    reco.compensation_plan_id ?? null
  );

  // Recalculer les wallets des bénéficiaires
  const { data: commissions } = await supabaseAdmin
    .from("commission_transactions")
    .select("user_id")
    .eq("recommendation_id", reco.id);

  const uniqueUsers = [...new Set((commissions ?? []).map((c) => c.user_id))];
  await Promise.all(uniqueUsers.map((userId) => recalculateWallet(userId)));

  // ── Marquer la session comme payée ───────────────────────────────────────────
  await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentSession.id);

  return NextResponse.json({ received: true });
}
