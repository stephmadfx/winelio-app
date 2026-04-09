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

