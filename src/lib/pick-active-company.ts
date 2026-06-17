/**
 * Sélectionne la première company active (non soft-deletée) parmi une liste
 * retournée par un `.select("companies(...)")` Supabase.
 *
 * Pourquoi : un même owner peut avoir plusieurs entreprises au fil du temps
 * (créée, renommée, supprimée…). Sans filtre, l'embed retourne TOUT y compris
 * les supprimées, et `array[0]` peut tomber sur une vieille entrée obsolète
 * — d'où des emails métier qui affichent un ancien nom.
 *
 * IMPORTANT : ce helper attend que le select inclue `deleted_at`.
 * Exemple : `companies(name, deleted_at)` ou `companies(name, email, source, deleted_at)`.
 */
export function pickActiveCompany<T extends { deleted_at?: string | null }>(
  raw: unknown,
): T | null {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? (raw as T[]) : [raw as T];
  return arr.find((c) => !c?.deleted_at) ?? null;
}
