import { SupabaseClient } from "@supabase/supabase-js";

interface CompensationPlan {
  id: string;
  commission_rate: number;
  referrer_percentage: number;
  level_1_percentage: number;
  level_2_percentage: number;
  level_3_percentage: number;
  level_4_percentage: number;
  level_5_percentage: number;
}

interface CommissionResult {
  referrer_commission: number;
  level_commissions: { level: number; amount: number }[];
}

export function calculateCommissions(
  dealAmount: number,
  plan: CompensationPlan
): CommissionResult {
  const baseCommission = dealAmount * (plan.commission_rate / 100);

  const referrer_commission = baseCommission * (plan.referrer_percentage / 100);

  const level_commissions: { level: number; amount: number }[] = [];
  const levelPercentages = [
    plan.level_1_percentage,
    plan.level_2_percentage,
    plan.level_3_percentage,
    plan.level_4_percentage,
    plan.level_5_percentage,
  ];

  for (let i = 0; i < 5; i++) {
    if (levelPercentages[i] > 0) {
      level_commissions.push({
        level: i + 1,
        amount: baseCommission * (levelPercentages[i] / 100),
      });
    }
  }

  return { referrer_commission, level_commissions };
}

export async function createCommissions(
  supabase: SupabaseClient,
  recommendationId: string,
  amount: number,
  referrerId: string,
  planId: string
) {
  // Fetch compensation plan
  const { data: plan, error: planError } = await supabase
    .from("compensation_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    throw new Error("Plan de compensation introuvable");
  }

  const { referrer_commission, level_commissions } = calculateCommissions(
    amount,
    plan as CompensationPlan
  );

  // Insert referrer commission
  await supabase.from("commission_transactions").insert({
    recommendation_id: recommendationId,
    profile_id: referrerId,
    amount: referrer_commission,
    type: "referrer",
    level: 0,
    status: "pending",
  });

  // Walk up the sponsor chain (up to 5 levels)
  let currentProfileId = referrerId;

  for (const lc of level_commissions) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentProfileId)
      .single();

    if (!profile?.sponsor_id) break;

    await supabase.from("commission_transactions").insert({
      recommendation_id: recommendationId,
      profile_id: profile.sponsor_id,
      amount: lc.amount,
      type: "sponsor",
      level: lc.level,
      status: "pending",
    });

    currentProfileId = profile.sponsor_id;
  }
}
