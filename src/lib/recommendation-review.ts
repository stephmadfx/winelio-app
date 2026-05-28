import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMMISSION_STATUS, COMMISSION_TYPE } from "@/lib/constants";
import { recalculateWallet } from "@/lib/wallet";
import { REVIEW_QUESTIONS } from "@/lib/recommendation-review-questions";

const MIN_ANSWER_CHARS = 20;
const MAX_ANSWER_CHARS = 500;
const LOW_EFFORT_TERMS = new Set([
  "ras",
  "rien",
  "ok",
  "oui",
  "non",
  "test",
  "a voir",
  "à voir",
  "en attente",
  "je sais pas",
  "je ne sais pas",
]);

export type ReviewValidationResult =
  | { ok: true; rating: number; answers: string[]; comment: string }
  | { ok: false; errors: string[] };

const normalizeText = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const hasEnoughWords = (value: string) =>
  new Set(value.toLocaleLowerCase("fr-FR").split(/\s+/).filter((word) => word.length > 2)).size >= 4;

const looksLikeLowEffort = (value: string) => {
  const normalized = value.toLocaleLowerCase("fr-FR").replace(/[.!?,;:]/g, "").trim();
  return (
    LOW_EFFORT_TERMS.has(normalized) ||
    /(.)\1{7,}/.test(normalized) ||
    /^[\W\d_]+$/.test(normalized) ||
    /https?:\/\/|www\.|@/.test(normalized)
  );
};

export const validateRecommendationReview = (
  ratingInput: unknown,
  answersInput: unknown
): ReviewValidationResult => {
  const errors: string[] = [];
  const rating = Number(ratingInput);
  const answers = Array.isArray(answersInput)
    ? answersInput.slice(0, REVIEW_QUESTIONS.length).map(normalizeText)
    : [];

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push("La note doit être comprise entre 1 et 5 étoiles.");
  }

  if (answers.length !== REVIEW_QUESTIONS.length) {
    errors.push("Les 3 réponses sont obligatoires.");
  }

  answers.forEach((answer, index) => {
    if (answer.length < MIN_ANSWER_CHARS) {
      errors.push(`Réponse ${index + 1} trop courte : ${MIN_ANSWER_CHARS} caractères minimum.`);
    }
    if (answer.length > MAX_ANSWER_CHARS) {
      errors.push(`Réponse ${index + 1} trop longue : ${MAX_ANSWER_CHARS} caractères maximum.`);
    }
    if (!hasEnoughWords(answer) || looksLikeLowEffort(answer)) {
      errors.push(`Réponse ${index + 1} insuffisamment détaillée.`);
    }
  });

  if (new Set(answers.map((answer) => answer.toLocaleLowerCase("fr-FR"))).size !== answers.length) {
    errors.push("Les réponses doivent être différentes les unes des autres.");
  }

  if (errors.length > 0) return { ok: false, errors };

  const comment = REVIEW_QUESTIONS.map((question, index) => `${question}\n${answers[index]}`).join("\n\n");
  return { ok: true, rating, answers, comment };
};

export const hasPaidProfessionalCommission = async (recommendationId: string) => {
  const { count } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId)
    .eq("status", "paid");

  return (count ?? 0) > 0;
};

export const hasValidReferrerReview = async (recommendationId: string, referrerId: string) => {
  const { count } = await supabaseAdmin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", recommendationId)
    .eq("reviewer_id", referrerId)
    .eq("status", "published");

  return (count ?? 0) > 0;
};

export const unlockRecommendationCommissions = async (recommendationId: string) => {
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id")
    .eq("id", recommendationId)
    .single();

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

  const { data: updated } = await supabaseAdmin
    .from("commission_transactions")
    .update({ status: COMMISSION_STATUS.EARNED })
    .eq("recommendation_id", recommendationId)
    .eq("status", COMMISSION_STATUS.PENDING)
    .in("type", unlockableTypes)
    .select("user_id");

  const userIds = [...new Set((updated ?? []).map((row) => row.user_id))];
  await Promise.allSettled(userIds.map((userId) => recalculateWallet(userId)));

  return { paid, reviewed, unlocked: updated?.length ?? 0 };
};
