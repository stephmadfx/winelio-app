import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { collectCommissionAutomatically } from "@/lib/stripe-automatic-commission";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
import { finalizeCommissionPayment } from "@/lib/finalize-commission-payment";
import { refundDuplicateStripePayment } from "@/lib/stripe-payment-safety";

const STALE_PROCESSING_MS = 10 * 60 * 1000;

export async function reconcileStripeCommissionPayments() {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  let recovered = 0;
  let fallbacks = 0;
  let unresolved = 0;
  let created = 0;

  const { data: processing, error: processingError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, recommendation_id, stripe_payment_intent_id")
    .eq("payment_mode", "automatic_card")
    .eq("status", "processing")
    .lt("created_at", staleBefore)
    .limit(50);
  if (processingError) throw new Error(`Lecture des paiements à réconcilier impossible: ${processingError.message}`);

  for (const record of processing ?? []) {
    if (!record.stripe_payment_intent_id) {
      // Résultat potentiellement inconnu : aucun second paiement n'est ouvert.
      unresolved++;
      continue;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(record.stripe_payment_intent_id);
      if (paymentIntent.status === "succeeded") {
        const finalization = await finalizeCommissionPayment(
          record.recommendation_id,
          record.id,
          paymentIntent.amount_received,
          paymentIntent.currency,
        );
        if (finalization.duplicate) {
          await refundDuplicateStripePayment(paymentIntent.id, record.id);
        }
        recovered++;
        continue;
      }

      if (["requires_action", "requires_payment_method", "canceled"].includes(paymentIntent.status)) {
        await supabaseAdmin
          .from("stripe_payment_sessions")
          .update({
            status: "failed",
            failure_code: paymentIntent.last_payment_error?.decline_code
              ?? paymentIntent.last_payment_error?.code
              ?? paymentIntent.status,
            failure_message: paymentIntent.last_payment_error?.message?.slice(0, 500)
              ?? "Le paiement automatique nécessite une intervention.",
          })
          .eq("id", record.id)
          .eq("status", "processing");
        await createStripeCheckoutSession(record.recommendation_id, {
          automaticAttemptFailed: true,
        });
        fallbacks++;
      }
    } catch (error) {
      console.error(`[stripe-reconciliation] ${record.id}:`, error);
      unresolved++;
    }
  }

  // Outbox de rattrapage : une confirmation client est persistée avant Stripe.
  // Cette passe reprend les dossiers COMPLETED laissés sans tentative active.
  const { data: completedRecommendations, error: completedError } = await supabaseAdmin
    .from("recommendations")
    .select("id")
    .in("status", ["PAYMENT_RECEIVED", "COMPLETED"])
    .eq("is_demo", false)
    .order("updated_at", { ascending: true })
    .limit(50);
  if (completedError) throw new Error(`Lecture des recommandations à reprendre impossible: ${completedError.message}`);

  for (const recommendation of completedRecommendations ?? []) {
    const { count, error } = await supabaseAdmin
      .from("stripe_payment_sessions")
      .select("id", { count: "exact", head: true })
      .eq("recommendation_id", recommendation.id)
      .in("status", ["processing", "pending", "paid"]);
    if (error) throw new Error(`Lecture de l'état Stripe impossible: ${error.message}`);
    if ((count ?? 0) > 0) continue;

    await collectCommissionAutomatically(recommendation.id);
    created++;
  }

  return { recovered, fallbacks, unresolved, created };
}
