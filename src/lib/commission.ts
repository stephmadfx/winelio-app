import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMMISSION_TYPE, COMMISSION_STATUS, WINELIO_SYSTEM_USER_ID } from "@/lib/constants";

interface CompensationPlan {
  id: string;
  commission_rate: number;
  referrer_percentage: number;
  level_1_percentage: number;
  level_2_percentage: number;
  level_3_percentage: number;
  level_4_percentage: number;
  level_5_percentage: number;
  platform_percentage: number;
  affiliation_percentage: number;
  cashback_wins_percentage: number;
}

interface CommissionResult {
  referrer_commission: number;
  level_commissions: { level: number; amount: number }[];
  platform_commission: number;
  affiliation_commission: number;
  cashback_wins: number;
}

export function calculateCommissions(
  dealAmount: number,
  plan: CompensationPlan
): CommissionResult {
  const baseCommission = dealAmount * (plan.commission_rate / 100);
  const referrer_commission = baseCommission * (plan.referrer_percentage / 100);

  const levelPercentages = [
    plan.level_1_percentage,
    plan.level_2_percentage,
    plan.level_3_percentage,
    plan.level_4_percentage,
    plan.level_5_percentage,
  ];

  const level_commissions = levelPercentages
    .map((pct, i) => ({ level: i + 1, amount: baseCommission * (pct / 100) }))
    .filter((lc) => lc.amount > 0);

  const platform_commission   = baseCommission * ((plan.platform_percentage   ?? 14) / 100);
  const affiliation_commission = baseCommission * ((plan.affiliation_percentage ?? 1)  / 100);
  const cashback_wins          = baseCommission * ((plan.cashback_wins_percentage ?? 1) / 100);

  return { referrer_commission, level_commissions, platform_commission, affiliation_commission, cashback_wins };
}

/**
 * Crée les commissions MLM pour une recommandation validée (étape 6).
 * Idempotente : ne fait rien si des commissions existent déjà pour cette recommandation.
 * Utilise supabaseAdmin pour bypasser la RLS (pas de policy INSERT sur commission_transactions).
 * Le trigger DB `on_commission_change` met à jour user_wallet_summaries automatiquement.
 */
export async function createCommissions(
  recommendationId: string,
  referrerId: string,
  professionalId: string,
  amount: number,
  planId: string | null
): Promise<void> {
  // Garde idempotente (via supabaseAdmin pour voir toutes les commissions, pas juste celles de l'user)
  const { count } = await supabaseAdmin
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId);

  if ((count ?? 0) > 0) return;

  // Résolution du plan : plan de la recommandation ou plan par défaut
  let resolvedPlanId = planId;
  if (!resolvedPlanId) {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    resolvedPlanId = defaultPlan?.id ?? null;
  }

  if (!resolvedPlanId) return;

  const { data: plan } = await supabaseAdmin
    .from("compensation_plans")
    .select("*")
    .eq("id", resolvedPlanId)
    .single();

  if (!plan) return;

  const { referrer_commission, level_commissions, platform_commission, affiliation_commission, cashback_wins } =
    calculateCommissions(amount, plan);

  const commissions: Array<{
    recommendation_id: string;
    user_id: string;
    amount: number;
    type: string;
    level: number;
    status: string;
  }> = [
    // Referrer (60%)
    {
      recommendation_id: recommendationId,
      user_id: referrerId,
      amount: referrer_commission,
      type: COMMISSION_TYPE.RECOMMENDATION,
      level: 0,
      status: COMMISSION_STATUS.EARNED,
    },
    // Cagnotte Winelio (14%)
    {
      recommendation_id: recommendationId,
      user_id: WINELIO_SYSTEM_USER_ID,
      amount: platform_commission,
      type: COMMISSION_TYPE.PLATFORM_WINELIO,
      level: 0,
      status: COMMISSION_STATUS.EARNED,
    },
  ];

  // Niveaux MLM (4% × 5)
  let currentId = referrerId;
  for (const lc of level_commissions) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();

    if (!profile?.sponsor_id) break;

    commissions.push({
      recommendation_id: recommendationId,
      user_id: profile.sponsor_id,
      amount: lc.amount,
      type: `referral_level_${lc.level}`,
      level: lc.level,
      status: COMMISSION_STATUS.EARNED,
    });

    currentId = profile.sponsor_id;
  }

  // Affiliation bonus (1%) → sponsor du professionnel
  if (affiliation_commission > 0) {
    const { data: proProfile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", professionalId)
      .single();

    if (proProfile?.sponsor_id) {
      commissions.push({
        recommendation_id: recommendationId,
        user_id: proProfile.sponsor_id,
        amount: affiliation_commission,
        type: COMMISSION_TYPE.AFFILIATION_BONUS,
        level: 0,
        status: COMMISSION_STATUS.EARNED,
      });
    }
  }

  // Cashback pro (1% en Wins) → le professionnel lui-même
  if (cashback_wins > 0) {
    commissions.push({
      recommendation_id: recommendationId,
      user_id: professionalId,
      amount: cashback_wins,
      type: COMMISSION_TYPE.PROFESSIONAL_CASHBACK,
      level: 0,
      status: COMMISSION_STATUS.EARNED,
    });
  }

  await supabaseAdmin.from("commission_transactions").insert(commissions);
}
