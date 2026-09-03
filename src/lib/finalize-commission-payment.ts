import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCommissions } from "@/lib/commission";
import { notifyReferrerCommissionCredited } from "@/lib/notify-commission-credited";
import { unlockRecommendationCommissions } from "@/lib/recommendation-review";
import { expireOtherCommissionCheckouts } from "@/lib/stripe-payment-safety";
import type { CompensationPlan } from "@/lib/commission";

type ClaimResult = {
  claimed?: boolean;
  already_claimed?: boolean;
  existing_payment_record_id?: string;
  error?: string;
};

export async function finalizeCommissionPayment(
  recommendationId: string,
  paymentRecordId: string,
  paidAmountCents: number,
  currency: string,
) {
  const [{ data: reco, error: recoError }, { data: paymentRecord, error: paymentError }] =
    await Promise.all([
      supabaseAdmin
        .from("recommendations")
        .select("id, referrer_id, professional_id, amount, compensation_plan_id")
        .eq("id", recommendationId)
        .single(),
      supabaseAdmin
        .from("stripe_payment_sessions")
        .select("id, amount, deal_amount, compensation_plan_id, plan_snapshot")
        .eq("id", paymentRecordId)
        .eq("recommendation_id", recommendationId)
        .single(),
    ]);

  if (recoError || !reco) throw new Error("Recommandation introuvable");
  if (paymentError || !paymentRecord) throw new Error("Paiement Winelio introuvable");

  const expectedAmountCents = Math.round(Number(paymentRecord.amount) * 100);
  if (currency.toLowerCase() !== "eur" || paidAmountCents !== expectedAmountCents) {
    throw new Error(
      `Montant Stripe incohérent: reçu ${paidAmountCents} ${currency}, attendu ${expectedAmountCents} eur`,
    );
  }

  const { data: claimData, error: claimError } = await supabaseAdmin.rpc(
    "claim_stripe_commission_payment",
    { p_payment_record_id: paymentRecordId },
  );
  if (claimError) throw new Error(`Verrou paiement impossible: ${claimError.message}`);

  const claim = claimData as ClaimResult | null;
  if (claim?.error) throw new Error(`Verrou paiement refusé: ${claim.error}`);
  if (!claim?.claimed) {
    return {
      duplicate: true as const,
      existingPaymentRecordId: claim?.existing_payment_record_id ?? null,
      payout: null,
    };
  }

  const dealAmount = Number(paymentRecord.deal_amount ?? reco.amount);
  const compensationPlanId = paymentRecord.compensation_plan_id ?? reco.compensation_plan_id ?? null;
  const planSnapshot = paymentRecord.plan_snapshot as CompensationPlan | null;
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) {
    throw new Error("Montant de l'affaire invalide dans l'instantané de paiement");
  }

  await createCommissions(
    reco.id,
    reco.referrer_id,
    reco.professional_id,
    dealAmount,
    compensationPlanId,
    planSnapshot,
  );

  await expireOtherCommissionCheckouts(recommendationId, paymentRecordId);
  const payout = await unlockRecommendationCommissions(recommendationId);
  await notifyReferrerCommissionCredited(recommendationId).catch((err) =>
    console.error("[stripe-payment] Échec notification cagnotte:", err),
  );

  return { duplicate: false as const, payout };
}
