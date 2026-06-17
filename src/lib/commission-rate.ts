export type CommissionRatePlan = {
  commission_rate?: number | null;
  high_amount_threshold?: number | null;
  high_amount_commission_rate?: number | null;
};

const DEFAULT_COMMISSION_RATE = 10;
const DEFAULT_HIGH_AMOUNT_THRESHOLD = 25_000;

const asFinitePositiveNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

export const resolveCommissionRateForAmount = (
  dealAmount: number,
  plan?: CommissionRatePlan | null
) => {
  const baseRate =
    asFinitePositiveNumber(plan?.commission_rate) ?? DEFAULT_COMMISSION_RATE;
  const threshold =
    asFinitePositiveNumber(plan?.high_amount_threshold) ??
    DEFAULT_HIGH_AMOUNT_THRESHOLD;
  const highAmountRate = asFinitePositiveNumber(
    plan?.high_amount_commission_rate
  );

  if (dealAmount > threshold && highAmountRate) {
    return highAmountRate;
  }

  return baseRate;
};

export const calculateCommissionBaseAmount = (
  dealAmount: number,
  plan?: CommissionRatePlan | null
) => {
  const rate = resolveCommissionRateForAmount(dealAmount, plan);
  return {
    rate,
    amount: Math.round(dealAmount * (rate / 100) * 100) / 100,
  };
};
