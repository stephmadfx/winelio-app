import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMMISSION_STATUS, COMMISSION_TYPE } from "@/lib/constants";
import { recalculateWallet } from "@/lib/wallet";
export { validateRecommendationReview } from "@/lib/review-validation";

export const hasPaidProfessionalCommission = async (recommendationId: string) => {
  const { count, error } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId)
    .eq("status", "paid");

  if (error) throw new Error(`Erreur lecture paiement: ${error.message}`);

  return (count ?? 0) > 0;
};

export const hasValidReferrerReview = async (recommendationId: string, referrerId: string) => {
  const { count, error } = await supabaseAdmin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId)
    .eq("reviewer_id", referrerId)
    .eq("status", "published");

  if (error) throw new Error(`Erreur lecture avis: ${error.message}`);

  return (count ?? 0) > 0;
};

export const unlockRecommendationCommissions = async (recommendationId: string) => {
  const { data: reco, error: recoError } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id")
    .eq("id", recommendationId)
    .single();

  if (recoError) throw new Error(`Erreur lecture recommandation: ${recoError.message}`);
  if (!reco) return { paid: false, reviewed: false, unlocked: 0 };

  const paid = await hasPaidProfessionalCommission(recommendationId);
  if (!paid) return { paid: false, reviewed: false, unlocked: 0 };

  const reviewed = await hasValidReferrerReview(recommendationId, reco.referrer_id);

  const unlockableTypes: string[] = [
    COMMISSION_TYPE.REFERRAL_LEVEL_1,
    COMMISSION_TYPE.REFERRAL_LEVEL_2,
    COMMISSION_TYPE.REFERRAL_LEVEL_3,
    COMMISSION_TYPE.REFERRAL_LEVEL_4,
    COMMISSION_TYPE.REFERRAL_LEVEL_5,
    COMMISSION_TYPE.AFFILIATION_BONUS,
    COMMISSION_TYPE.PROFESSIONAL_CASHBACK,
    COMMISSION_TYPE.PLATFORM_WINELIO,
  ];

  if (reviewed) unlockableTypes.push(COMMISSION_TYPE.RECOMMENDATION);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("commission_transactions")
    .update({ status: COMMISSION_STATUS.EARNED })
    .eq("recommendation_id", recommendationId)
    .eq("status", COMMISSION_STATUS.PENDING)
    .in("type", unlockableTypes)
    .select("user_id");

  if (updateError) throw new Error(`Erreur déblocage commissions: ${updateError.message}`);

  const userIds = [...new Set((updated ?? []).map((row) => row.user_id))];
  await Promise.all(userIds.map((userId) => recalculateWallet(userId)));

  return { paid, reviewed, unlocked: updated?.length ?? 0 };
};
