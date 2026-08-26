/**
 * Règle unique de complétude du profil.
 *
 * Elle est évaluée par le middleware (qui décide de la redirection) et par le
 * layout protégé (qui pilote l'affichage). Les deux doivent lire exactement la
 * même définition, sinon on retombe sur une boucle de redirection.
 */

export const PROFILE_COMPLETION_SELECT =
  "first_name, last_name, phone, postal_code, city, address, birth_date, terms_accepted, is_professional";

export type ProfileCompletionFields = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  city?: string | null;
  address?: string | null;
  birth_date?: string | null;
  terms_accepted?: boolean | null;
  is_professional?: boolean | null;
};

export type CompanyCompletionFields = { name?: string | null; siret?: string | null };

export function isPersonalProfileComplete(profile: ProfileCompletionFields | null): boolean {
  return !!(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.phone?.trim() &&
    profile?.postal_code?.trim() &&
    profile?.city?.trim() &&
    profile?.address?.trim() &&
    profile?.birth_date?.trim() &&
    profile?.terms_accepted
  );
}

export function isProfessionalProfileComplete(
  profile: ProfileCompletionFields | null,
  companies: CompanyCompletionFields[],
): boolean {
  if (!profile?.is_professional) return true;
  return companies.some((c) => c?.siret?.trim() && c?.name?.trim());
}

/** Routes de l'espace protégé qui restent accessibles tant que le profil est incomplet. */
const ALWAYS_ALLOWED_PREFIXES = ["/profile", "/companies"];

/**
 * Routes soumises à la complétion. Liste explicite plutôt qu'une exclusion :
 * une nouvelle route publique ajoutée par erreur ne doit pas devenir bloquante.
 */
const GATED_PREFIXES = [
  "/dashboard",
  "/recommendations",
  "/network",
  "/wallet",
  "/settings",
  "/test-recommendation",
];

export function requiresCompleteProfile(pathname: string): boolean {
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Fenêtre laissée à l'inscription pour finir d'écrire le profil avant que la
 * redirection ne s'applique.
 */
export function isSignupGracePeriod(emailConfirmedAt: string | null | undefined): boolean {
  if (!emailConfirmedAt) return false;
  return Date.now() - new Date(emailConfirmedAt).getTime() < 60_000;
}

/** Cookie posé une fois le profil complet, pour éviter une requête DB par navigation. */
export const PROFILE_COMPLETE_COOKIE = "winelio_profile_ok";
