export const REVIEW_QUESTION = "Est-ce que vous recommanderiez ce professionnel ?";
export const REVIEW_MAX_COMMENT_LENGTH = 5000;

// Refuse aussi les domaines sans protocole, les liens Markdown et les URL masquées
// par des caractères invisibles. Le texte sera toujours rendu comme du texte.
export function containsReviewLink(value: string): boolean {
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  return /(?:https?|ftp|mailto|tel|javascript|data):|www\s*\.|\[[^\]]*\]\s*\(|(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:\b|\/)|\b(?:\d{1,3}\.){3}\d{1,3}\b/iu.test(text);
}

export function validateReviewComment(input: unknown): { ok: true; comment: string } | { ok: false; errors: string[] } {
  if (input != null && typeof input !== "string") return { ok: false, errors: ["Le commentaire doit être un texte."] };
  const comment = (input as string | null | undefined ?? "").trim();
  if (comment.length > REVIEW_MAX_COMMENT_LENGTH) return { ok: false, errors: ["Le commentaire est limité à 5 000 caractères."] };
  if (containsReviewLink(comment)) return { ok: false, errors: ["Les liens ne sont pas autorisés dans les commentaires."] };
  return { ok: true, comment };
}

export function validateRecommendationReview(rating: unknown, input: unknown) {
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false as const, errors: ["Choisissez une note de 1 à 5 étoiles."] };
  }
  const result = validateReviewComment(input);
  if (!result.ok) return result;
  return { ok: true as const, rating, comment: result.comment };
}
