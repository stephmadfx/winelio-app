import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function refundDuplicateStripePayment(
  paymentIntentId: string,
  paymentRecordId: string,
) {
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, reason: "duplicate" },
    { idempotencyKey: `commission-duplicate-refund:${paymentRecordId}` },
  );

  await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({
      status: "refunded",
      paid_at: null,
      failure_code: "duplicate_refunded",
      failure_message: "Paiement concurrent remboursé automatiquement.",
      stripe_refund_id: refund.id,
      refunded_at: new Date().toISOString(),
    })
    .eq("id", paymentRecordId);
}

export async function expireOtherCommissionCheckouts(
  recommendationId: string,
  winningPaymentRecordId: string,
) {
  const { data: alternatives } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, stripe_session_id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "pending")
    .neq("id", winningPaymentRecordId);

  for (const alternative of alternatives ?? []) {
    if (!alternative.stripe_session_id) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(alternative.stripe_session_id);
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(alternative.stripe_session_id);
        await supabaseAdmin
          .from("stripe_payment_sessions")
          .update({ status: "expired" })
          .eq("id", alternative.id)
          .eq("status", "pending");
      } else if (session.status === "expired") {
        await supabaseAdmin
          .from("stripe_payment_sessions")
          .update({ status: "expired" })
          .eq("id", alternative.id)
          .eq("status", "pending");
      }
    } catch (error) {
      console.error("[stripe-payment] Expiration du Checkout concurrent impossible:", error);
    }
  }
}
