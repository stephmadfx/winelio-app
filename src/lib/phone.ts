export const PHONE_ALREADY_ACTIVE_MESSAGE =
  "Un compte est déjà actif avec ce numéro de téléphone. Connectez-vous avec l’adresse e-mail associée.";

export const PHONE_INVALID_MESSAGE =
  "Saisissez un numéro de téléphone français valide ou un numéro belge au format +32.";

/**
 * Convertit les numéros français et belges en E.164.
 * Les numéros locaux sont interprétés comme français ; un numéro belge doit
 * donc être saisi avec +32 ou 0032.
 */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!raw.startsWith("+") && digits.startsWith("0")) {
    digits = `33${digits.slice(1)}`;
  }

  const isFrench = /^33[1-9]\d{8}$/.test(digits);
  const isBelgian = /^32[1-9]\d{7,8}$/.test(digits);
  return isFrench || isBelgian ? `+${digits}` : null;
}

export function isPhoneUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(candidate.message ?? "")} ${String(candidate.details ?? "")}`.toLowerCase();
  return candidate.code === "23505" && text.includes("phone");
}
