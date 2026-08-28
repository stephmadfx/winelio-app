// ─── Types de commission (contrainte CHECK DB) ────────────────────────────────

export const COMMISSION_TYPE = {
  RECOMMENDATION:        "recommendation",
  REFERRAL_LEVEL_1:      "referral_level_1",
  REFERRAL_LEVEL_2:      "referral_level_2",
  REFERRAL_LEVEL_3:      "referral_level_3",
  REFERRAL_LEVEL_4:      "referral_level_4",
  REFERRAL_LEVEL_5:      "referral_level_5",
  AFFILIATION_BONUS:     "affiliation_bonus",
  PROFESSIONAL_CASHBACK: "professional_cashback",
  MANUAL_ADJUSTMENT:     "manual_adjustment",
  PLATFORM_WINELIO:      "platform_winelio",
} as const;

// UUID réservé au profil système "Cagnotte Winelio"
export const WINELIO_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export type CommissionType = typeof COMMISSION_TYPE[keyof typeof COMMISSION_TYPE];

// ─── Statuts commission ───────────────────────────────────────────────────────

export const COMMISSION_STATUS = {
  PENDING:   "PENDING",
  EARNED:    "EARNED",
  CANCELLED: "CANCELLED",
} as const;

export type CommissionStatus = typeof COMMISSION_STATUS[keyof typeof COMMISSION_STATUS];

// ─── Statuts retrait ──────────────────────────────────────────────────────────

export const WITHDRAWAL_STATUS = {
  PENDING:    "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED:  "COMPLETED",
  REJECTED:   "REJECTED",
} as const;

export type WithdrawalStatus = typeof WITHDRAWAL_STATUS[keyof typeof WITHDRAWAL_STATUS];

// ─── Statuts recommandation ───────────────────────────────────────────────────

export const RECOMMENDATION_STATUS = {
  PENDING:           "PENDING",
  ACCEPTED:          "ACCEPTED",
  CONTACT_MADE:      "CONTACT_MADE",
  MEETING_SCHEDULED: "MEETING_SCHEDULED",
  QUOTE_SUBMITTED:   "QUOTE_SUBMITTED",
  QUOTE_VALIDATED:   "QUOTE_VALIDATED",
  PAYMENT_RECEIVED:  "PAYMENT_RECEIVED",
  COMPLETED:         "COMPLETED",
  CANCELLED:         "CANCELLED",
  REJECTED:          "REJECTED",
  TRANSFERRED:       "TRANSFERRED",
  EXPIRED:           "EXPIRED",
} as const;

export type RecommendationStatus = typeof RECOMMENDATION_STATUS[keyof typeof RECOMMENDATION_STATUS];

/** Statut reco posé quand l'étape d'`order_index` N est complétée. */
export const RECOMMENDATION_STATUS_BY_STEP: Record<number, RecommendationStatus> = {
  1: RECOMMENDATION_STATUS.PENDING,
  2: RECOMMENDATION_STATUS.ACCEPTED,
  3: RECOMMENDATION_STATUS.CONTACT_MADE,
  4: RECOMMENDATION_STATUS.MEETING_SCHEDULED,
  5: RECOMMENDATION_STATUS.QUOTE_SUBMITTED,
  6: RECOMMENDATION_STATUS.QUOTE_VALIDATED,
  7: RECOMMENDATION_STATUS.PAYMENT_RECEIVED,
  8: RECOMMENDATION_STATUS.COMPLETED,
};
