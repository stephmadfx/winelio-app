import assert from "node:assert/strict";
import {
  assertValidCompensationPlan,
  type CompensationPlan,
} from "../../src/lib/commission";
import {
  STRIPE_OFF_SESSION_CONSENT_TEXT,
  STRIPE_OFF_SESSION_CONSENT_VERSION,
} from "../../src/lib/stripe-off-session-consent";
import { calculateCommissionBaseAmount } from "../../src/lib/commission-rate";

const validPlan: CompensationPlan = {
  id: "00000000-0000-0000-0000-000000000001",
  commission_rate: 10,
  high_amount_threshold: 25_000,
  high_amount_commission_rate: 5,
  referrer_percentage: 60,
  level_1_percentage: 3,
  level_2_percentage: 3,
  level_3_percentage: 3,
  level_4_percentage: 3,
  level_5_percentage: 3,
  platform_percentage: 23,
  affiliation_percentage: 1,
  cashback_wins_percentage: 1,
};

assert.doesNotThrow(() => assertValidCompensationPlan(validPlan));
assert.throws(
  () => assertValidCompensationPlan({ ...validPlan, platform_percentage: 22 }),
  /Plan de commission invalide/,
);
assert.match(STRIPE_OFF_SESSION_CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}-v\d+$/);
assert.match(STRIPE_OFF_SESSION_CONSENT_TEXT, /sans nouvelle validation de ma part/);
assert.match(STRIPE_OFF_SESSION_CONSENT_TEXT, /montant est variable/);
assert.match(STRIPE_OFF_SESSION_CONSENT_TEXT, /avoir encaissé le règlement de mon client/);
assert.match(STRIPE_OFF_SESSION_CONSENT_TEXT, /choisir une autre carte/);
assert.deepEqual(calculateCommissionBaseAmount(25_000, validPlan), { rate: 10, amount: 2_500 });
assert.deepEqual(calculateCommissionBaseAmount(25_000.01, validPlan), { rate: 5, amount: 1_250 });
assert.deepEqual(calculateCommissionBaseAmount(30_000, validPlan), { rate: 5, amount: 1_500 });

console.log("automatic-commission-guards: OK");
