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

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Barème par tranches : taux de base jusqu'au seuil inclus, puis taux réduit
 * sur la seule fraction au-delà du seuil. Ex. 30 000 € → 10 % × 25 000 + 5 % × 5 000.
 * `rate` renvoyé = taux effectif sur la totalité (pour affichage et métadonnées).
 */
export const calculateCommissionBaseAmount = (
  dealAmount: number,
  plan?: CommissionRatePlan | null
) => {
  const baseRate =
    asFinitePositiveNumber(plan?.commission_rate) ?? DEFAULT_COMMISSION_RATE;
  const threshold =
    asFinitePositiveNumber(plan?.high_amount_threshold) ??
    DEFAULT_HIGH_AMOUNT_THRESHOLD;
  const highAmountRate =
    asFinitePositiveNumber(plan?.high_amount_commission_rate) ?? baseRate;

  const baseTranche = Math.min(dealAmount, threshold);
  const upperTranche = Math.max(dealAmount - threshold, 0);
  const amount = round2(
    baseTranche * (baseRate / 100) + upperTranche * (highAmountRate / 100)
  );

  return {
    rate: dealAmount > 0 ? round2((amount / dealAmount) * 100) : baseRate,
    amount,
  };
};
