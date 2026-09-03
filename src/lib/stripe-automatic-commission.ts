import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateCommissionBaseAmount } from "@/lib/commission-rate";
import { assertValidCompensationPlan, type CompensationPlan } from "@/lib/commission";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
import { finalizeCommissionPayment } from "@/lib/finalize-commission-payment";
import { STRIPE_OFF_SESSION_CONSENT_VERSION } from "@/lib/stripe-off-session-consent";
import { refundDuplicateStripePayment } from "@/lib/stripe-payment-safety";

type CollectionResult =
  | { mode: "automatic_card"; status: "paid" | "processing" }
  | { mode: "checkout"; status: "pending"; url: string }
  | { mode: "test"; status: "skipped" };

type StripeFailure = Error & {
  type?: string;
  code?: string;
  decline_code?: string;
  payment_intent?: { id?: string };
  raw?: {
    code?: string;
    decline_code?: string;
    payment_intent?: { id?: string };
  };
};

async function fallbackToCheckout(
  recommendationId: string,
  paymentRecordId: string,
  failure: { code: string; message: string },
): Promise<CollectionResult> {
  await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({
      status: "failed",
      failure_code: failure.code,
      failure_message: failure.message.slice(0, 500),
    })
    .eq("id", paymentRecordId);

  const url = await createStripeCheckoutSession(recommendationId, {
    notifyProfessional: true,
    automaticAttemptFailed: true,
  });
  return { mode: "checkout", status: "pending", url };
}

export async function collectCommissionAutomatically(
  recommendationId: string,
): Promise<CollectionResult> {
  const { data: alreadyPaid } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "paid")
    .maybeSingle();
  if (alreadyPaid) return { mode: "automatic_card", status: "paid" };

  const { data: reco, error: recoError } = await supabaseAdmin
    .from("recommendations")
    .select(
      "id, amount, professional_id, compensation_plan_id, is_demo, contact:contacts(first_name, last_name, email)",
    )
    .eq("id", recommendationId)
    .single();

  if (recoError || !reco) throw new Error("Recommandation introuvable");
  if (!reco.amount) throw new Error("Recommandation sans montant");

  const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
  if (reco.is_demo || contact?.email?.toLowerCase().endsWith("@winelio-e2e.local")) {
    return { mode: "test", status: "skipped" };
  }

  // Permet de déployer le parcours et le consentement avant l'activation
  // commerciale finale, sans risquer de débiter une carte réelle.
  if (process.env.STRIPE_AUTOMATIC_COMMISSION_ENABLED !== "true") {
    const url = await createStripeCheckoutSession(recommendationId);
    return { mode: "checkout", status: "pending", url };
  }

  const { data: previousDefinitiveFailure } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id")
    .eq("recommendation_id", recommendationId)
    .eq("payment_mode", "automatic_card")
    .eq("status", "failed")
    .neq("failure_code", "outcome_unknown")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousDefinitiveFailure) {
    const url = await createStripeCheckoutSession(recommendationId, {
      automaticAttemptFailed: true,
    });
    return { mode: "checkout", status: "pending", url };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "stripe_customer_id, stripe_payment_method_id, stripe_off_session_consent_version, stripe_off_session_consent_at",
    )
    .eq("id", reco.professional_id)
    .single();

  const hasCurrentConsent =
    profile?.stripe_off_session_consent_version === STRIPE_OFF_SESSION_CONSENT_VERSION &&
    Boolean(profile?.stripe_off_session_consent_at);

  if (!profile?.stripe_customer_id || !profile.stripe_payment_method_id || !hasCurrentConsent) {
    const url = await createStripeCheckoutSession(recommendationId);
    return { mode: "checkout", status: "pending", url };
  }

  let plan: CompensationPlan | null = null;
  if (reco.compensation_plan_id) {
    const { data, error } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("id", reco.compensation_plan_id)
      .single();
    if (error) throw new Error(`Lecture du plan de commission impossible: ${error.message}`);
    plan = data as CompensationPlan | null;
  } else {
    const { data, error } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    if (error) throw new Error(`Lecture du plan de commission impossible: ${error.message}`);
    plan = data as CompensationPlan | null;
  }

  if (!plan) throw new Error("Aucun plan de commission actif");
  assertValidCompensationPlan(plan);

  const { amount: commissionAmount, rate } = calculateCommissionBaseAmount(reco.amount, plan);
  const { data: paymentRecord, error: recordError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .insert({
      recommendation_id: recommendationId,
      stripe_session_id: null,
      amount: commissionAmount,
      status: "processing",
      payment_mode: "automatic_card",
      deal_amount: reco.amount,
      commission_rate: rate,
      compensation_plan_id: plan.id,
      plan_snapshot: plan,
    })
    .select("id")
    .single();

  if (recordError || !paymentRecord) {
    if (recordError?.code === "23505") {
      const { data: active } = await supabaseAdmin
        .from("stripe_payment_sessions")
        .select("status, payment_mode")
        .eq("recommendation_id", recommendationId)
        .in("status", ["processing", "pending"])
        .maybeSingle();
      if (active?.status === "processing") {
        return { mode: "automatic_card", status: "processing" };
      }
      if (active?.status === "pending") {
        const url = await createStripeCheckoutSession(recommendationId, {
          notifyProfessional: false,
        });
        return { mode: "checkout", status: "pending", url };
      }
    }
    throw new Error(`Impossible de réserver le paiement: ${recordError?.message ?? "inconnu"}`);
  }

  const proAuth = await supabaseAdmin.auth.admin.getUserById(reco.professional_id);
  const clientName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
    : "Client";

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(commissionAmount * 100),
        currency: "eur",
        customer: profile.stripe_customer_id,
        payment_method: profile.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        receipt_email: proAuth.data.user?.email ?? undefined,
        description: `Commission d'intermédiation Winelio — ${clientName}`,
        metadata: {
          recommendation_id: recommendationId,
          professional_id: reco.professional_id,
          deal_amount: String(reco.amount),
          commission_rate: String(rate),
          payment_record_id: paymentRecord.id,
        },
      },
      { idempotencyKey: `commission-auto:${paymentRecord.id}` },
    );
  } catch (error) {
    const stripeError = error as StripeFailure;
    const paymentIntentId =
      stripeError.payment_intent?.id ?? stripeError.raw?.payment_intent?.id;
    if (paymentIntentId) {
      const { error: linkError } = await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", paymentRecord.id);
      if (linkError) throw new Error(`Réconciliation PaymentIntent impossible: ${linkError.message}`);

      const recovered = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (recovered.status === "succeeded") {
        const finalization = await finalizeCommissionPayment(
          recommendationId,
          paymentRecord.id,
          recovered.amount_received,
          recovered.currency,
        );
        if (finalization.duplicate) {
          await refundDuplicateStripePayment(recovered.id, paymentRecord.id);
        }
        return { mode: "automatic_card", status: "paid" };
      }
      if (recovered.status === "processing") {
        return { mode: "automatic_card", status: "processing" };
      }
    }

    const failureCode =
      stripeError.decline_code ??
      stripeError.raw?.decline_code ??
      stripeError.code ??
      stripeError.raw?.code ??
      "automatic_payment_failed";
    const definitiveFailure =
      stripeError.type === "StripeCardError" ||
      Boolean(stripeError.decline_code ?? stripeError.raw?.decline_code) ||
      ["card_declined", "expired_card", "authentication_required"].includes(failureCode);

    if (!definitiveFailure) {
      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({
          failure_code: "outcome_unknown",
          failure_message: stripeError.message.slice(0, 500),
        })
        .eq("id", paymentRecord.id);
      return { mode: "automatic_card", status: "processing" };
    }

    return fallbackToCheckout(recommendationId, paymentRecord.id, {
      code: failureCode,
      message: stripeError.message || "Paiement automatique refusé",
    });
  }

  const { error: linkError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", paymentRecord.id);
  if (linkError) {
    throw new Error(`Réconciliation PaymentIntent impossible: ${linkError.message}`);
  }

  if (paymentIntent.status === "succeeded") {
    const finalization = await finalizeCommissionPayment(
      recommendationId,
      paymentRecord.id,
      paymentIntent.amount_received,
      paymentIntent.currency,
    );
    if (finalization.duplicate) {
      await refundDuplicateStripePayment(paymentIntent.id, paymentRecord.id);
    }
    return { mode: "automatic_card", status: "paid" };
  }
  if (paymentIntent.status === "processing") {
    return { mode: "automatic_card", status: "processing" };
  }

  return fallbackToCheckout(recommendationId, paymentRecord.id, {
    code: paymentIntent.status,
    message: "Le paiement automatique nécessite l’intervention du professionnel.",
  });
}
