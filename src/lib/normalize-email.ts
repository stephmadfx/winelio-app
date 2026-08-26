/**
 * Forme canonique d'une adresse email : minuscules, sans espaces autour.
 *
 * `otp_codes.email` et `auth.users.email` sont stockés sous cette forme. Toute
 * comparaison SQL (`=`) étant sensible à la casse, une route qui interroge ces
 * tables avec la saisie brute de l'utilisateur ne trouve rien dès qu'une
 * majuscule ou une espace traîne (clavier mobile, copier-coller, autofill).
 */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
