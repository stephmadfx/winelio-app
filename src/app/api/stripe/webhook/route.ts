import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finalizeCommissionPayment } from "@/lib/finalize-commission-payment";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
import { refundDuplicateStripePayment } from "@/lib/stripe-payment-safety";

async function findPaymentRecord(
  recommendationId: string,
  paymentIntentId: string,
  recordId?: string,
) {
  let query = supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, status")
    .eq("recommendation_id", recommendationId);

  query = recordId
    ? query.eq("id", recordId)
    : query.eq("stripe_payment_intent_id", paymentIntentId);

  let { data } = await query.maybeSingle();
  if (!data) {
    const result = await supabaseAdmin
      .from("stripe_payment_sessions")
      .select("id, status")
      .eq("recommendation_id", recommendationId)
      .eq("payment_mode", "automatic_card")
      .eq("status", "processing")
      .maybeSingle();
    data = result.data;
  }
  return data;
}

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

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const recommendationId = paymentIntent.metadata?.recommendation_id;
    if (!recommendationId) return NextResponse.json({ received: true, skipped: "not_commission" });

    const paymentRecord = await findPaymentRecord(
      recommendationId,
      paymentIntent.id,
      paymentIntent.metadata?.payment_record_id,
    );
    if (!paymentRecord) {
      return NextResponse.json({ error: "Paiement automatique introuvable en DB" }, { status: 404 });
    }

    await supabaseAdmin
      .from("stripe_payment_sessions")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", paymentRecord.id);

    const finalization = await finalizeCommissionPayment(
      recommendationId,
      paymentRecord.id,
      paymentIntent.amount_received,
      paymentIntent.currency,
    );
    if (finalization.duplicate) {
      await refundDuplicateStripePayment(paymentIntent.id, paymentRecord.id);
    }
    return NextResponse.json({ received: true, finalization });
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const recommendationId = paymentIntent.metadata?.recommendation_id;
    if (!recommendationId) return NextResponse.json({ received: true, skipped: "not_commission" });

    const paymentRecord = await findPaymentRecord(
      recommendationId,
      paymentIntent.id,
      paymentIntent.metadata?.payment_record_id,
    );
    if (paymentRecord && paymentRecord.status !== "paid") {
      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          status: "failed",
          failure_code: paymentIntent.last_payment_error?.decline_code
            ?? paymentIntent.last_payment_error?.code
            ?? "payment_failed",
          failure_message: paymentIntent.last_payment_error?.message?.slice(0, 500) ?? null,
        })
        .eq("id", paymentRecord.id);

      await createStripeCheckoutSession(recommendationId, {
        automaticAttemptFailed: true,
      }).catch((error) =>
        console.error("[stripe-webhook] Échec création du lien de régularisation:", error),
      );
    }
    return NextResponse.json({ received: true });
  }

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
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

  const { data: paymentSession } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .single();
  if (!paymentSession) {
    return NextResponse.json({ error: "Session introuvable en DB" }, { status: 404 });
  }

  const checkoutPaymentIntent = typeof session.payment_intent === "string"
    ? await stripe.paymentIntents.retrieve(session.payment_intent)
    : session.payment_intent;
  if (!checkoutPaymentIntent || checkoutPaymentIntent.status !== "succeeded") {
    return NextResponse.json({ received: true, skipped: "payment_intent_not_succeeded" });
  }

  const finalization = await finalizeCommissionPayment(
    recommendationId,
    paymentSession.id,
    checkoutPaymentIntent.amount_received,
    checkoutPaymentIntent.currency,
  );
  if (finalization.duplicate) {
    await refundDuplicateStripePayment(checkoutPaymentIntent.id, paymentSession.id);
  }
  return NextResponse.json({ received: true, finalization });
}
