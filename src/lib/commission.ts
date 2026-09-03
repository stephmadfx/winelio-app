import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMMISSION_TYPE, COMMISSION_STATUS, WINELIO_SYSTEM_USER_ID } from "@/lib/constants";
import { calculateCommissionBaseAmount } from "@/lib/commission-rate";

export interface CompensationPlan {
  id: string;
  commission_rate: number;
  high_amount_threshold?: number | null;
  high_amount_commission_rate?: number | null;
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

export function assertValidCompensationPlan(plan: CompensationPlan): void {
  const percentages = [
    plan.referrer_percentage,
    plan.level_1_percentage,
    plan.level_2_percentage,
    plan.level_3_percentage,
    plan.level_4_percentage,
    plan.level_5_percentage,
    plan.platform_percentage,
    plan.affiliation_percentage,
    plan.cashback_wins_percentage,
  ].map(Number);
  const total = percentages.reduce((sum, value) => sum + value, 0);
  if (
    !Number.isFinite(Number(plan.commission_rate)) ||
    Number(plan.commission_rate) <= 0 ||
    percentages.some((value) => !Number.isFinite(value) || value < 0) ||
    Math.abs(total - 100) > 0.001
  ) {
    throw new Error(`Plan de commission invalide (répartition=${total})`);
  }
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
  const { amount: baseCommission } = calculateCommissionBaseAmount(dealAmount, plan);
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

  const platform_commission   = baseCommission * ((plan.platform_percentage   ?? 23) / 100);
  const affiliation_commission = baseCommission * ((plan.affiliation_percentage ?? 1)  / 100);
  const cashback_wins          = baseCommission * ((plan.cashback_wins_percentage ?? 1) / 100);

  return { referrer_commission, level_commissions, platform_commission, affiliation_commission, cashback_wins };
}

/**
 * Crée les commissions MLM pour une recommandation validée (étape 6).
 * Idempotente : ne fait rien si des commissions existent déjà pour cette recommandation.
 * Utilise supabaseAdmin pour bypasser la RLS (pas de policy INSERT sur commission_transactions).
 * Le trigger DB `on_commission_change` met à jour user_wallet_summaries automatiquement.
 * Les commissions restent PENDING jusqu'au paiement Stripe du pro.
 * La commission directe du recommandeur reste PENDING tant que son avis qualifié
 * n'a pas été déposé.
 */
export async function createCommissions(
  recommendationId: string,
  referrerId: string,
  professionalId: string,
  amount: number,
  planId: string | null,
  planSnapshot?: CompensationPlan | null,
): Promise<void> {
  const { data: recommendation, error: recommendationError } = await supabaseAdmin
    .from("recommendations")
    .select("is_demo")
    .eq("id", recommendationId)
    .single();

  if (recommendationError || !recommendation) {
    throw new Error(
      `Impossible de déterminer le périmètre de la recommandation ${recommendationId}: ${recommendationError?.message ?? "introuvable"}`
    );
  }
  const isDemo = Boolean(recommendation.is_demo);

  // Garde idempotente (via supabaseAdmin pour voir toutes les commissions, pas juste celles de l'user)
  const { count } = await supabaseAdmin
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId);

  if ((count ?? 0) > 0) return;

  // Résolution du plan : plan de la recommandation ou plan par défaut
  let resolvedPlanId = planSnapshot?.id ?? planId;
  if (!resolvedPlanId) {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    resolvedPlanId = defaultPlan?.id ?? null;
  }

  if (!resolvedPlanId) {
    throw new Error("Aucun plan de commission actif");
  }

  let plan = planSnapshot ?? null;
  if (!plan) {
    const { data, error } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("id", resolvedPlanId)
      .single();
    if (error) throw new Error(`Lecture du plan de commission impossible: ${error.message}`);
    plan = data as CompensationPlan | null;
  }

  if (!plan) throw new Error("Plan de commission introuvable");
  assertValidCompensationPlan(plan);

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
      status: COMMISSION_STATUS.PENDING,
    },
    // Cagnotte Winelio (23% sur le plan standard actif)
    {
      recommendation_id: recommendationId,
      user_id: WINELIO_SYSTEM_USER_ID,
      amount: platform_commission,
      type: COMMISSION_TYPE.PLATFORM_WINELIO,
      level: 0,
      status: COMMISSION_STATUS.PENDING,
    },
  ];

  // Niveaux MLM (3% × 5 sur le plan standard actif) — les niveaux non distribués vont à la cagnotte
  let currentId = referrerId;
  let undistributed = 0;
  let chainBroken = false;
  for (const lc of level_commissions) {
    if (chainBroken) {
      undistributed += lc.amount;
      continue;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();

    if (!profile?.sponsor_id) {
      chainBroken = true;
      undistributed += lc.amount;
      continue;
    }

    commissions.push({
      recommendation_id: recommendationId,
      user_id: profile.sponsor_id,
      amount: lc.amount,
      type: `referral_level_${lc.level}`,
      level: lc.level,
      status: COMMISSION_STATUS.PENDING,
    });

    currentId = profile.sponsor_id;
  }

  // Affiliation bonus (1%) → sponsor du professionnel, ou cagnotte si absent
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
        status: COMMISSION_STATUS.PENDING,
      });
    } else {
      undistributed += affiliation_commission;
    }
  }

  // Abonder la cagnotte Winelio avec les montants non distribués
  if (undistributed > 0) {
    const platformEntry = commissions.find((c) => c.type === COMMISSION_TYPE.PLATFORM_WINELIO);
    if (platformEntry) {
      platformEntry.amount = Math.round((platformEntry.amount + undistributed) * 100) / 100;
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
      status: COMMISSION_STATUS.PENDING,
    });
  }

  const { error: insertError } = await supabaseAdmin
    .from("commission_transactions")
    .insert(commissions.map((commission) => ({ ...commission, is_demo: isDemo })));

  if (insertError) {
    // Un webhook Stripe et la réponse synchrone du PaymentIntent peuvent
    // finaliser le même paiement presque simultanément. La contrainte unique
    // garantit l'intégrité ; le second traitement est alors déjà satisfait.
    if (insertError.code === "23505") return;
    throw new Error(
      `Échec de création des commissions pour ${recommendationId}: ${insertError.message}`
    );
  }
}
