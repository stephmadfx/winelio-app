import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Règle d'affichage Winelio :
 *   - Prénom : première lettre majuscule, reste minuscule  → "Marie"
 *   - Nom    : tout en majuscules                          → "DUPONT"
 * Retourne "Prénom NOM", "Prénom" (sans nom), ou le fallback fourni.
 */
export function formatDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = "Membre",
): string {
  const first = firstName?.trim();
  const last = lastName?.trim();
  const f = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : null;
  const l = last ? last.toUpperCase() : null;
  return [f, l].filter(Boolean).join(" ") || fallback;
}

/** Prénom seul formaté (première lettre majuscule, reste minuscule). */
export function formatFirstName(firstName: string | null | undefined): string {
  const s = firstName?.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
