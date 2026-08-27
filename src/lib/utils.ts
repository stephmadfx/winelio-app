import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalizeName(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (char) => char.toUpperCase());
}

export function formatDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallback = "Utilisateur"
) {
  const name = [firstName, lastName]
    .map((part) => capitalizeName(String(part ?? "").trim()))
    .filter(Boolean)
    .join(" ");

  return name || fallback;
}

function firstLetterUpper(value: string): string {
  const letter = [...value][0];
  return letter ? letter.toUpperCase() : "";
}

/**
 * Nom du prospect côté pro, avant acceptation / révélation des coordonnées.
 * Prénom conservé (tronqué à 10 caractères s'il est plus long) + nom de famille
 * réduit à la première lettre : « Christophe C. » / « Christophe C. (Paris) ».
 */
export function formatMaskedProspectName(
  firstName?: string | null,
  lastName?: string | null,
  city?: string | null,
  fallback = "Contact"
): string {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  const place = String(city ?? "").trim();
  const firstDisplay = first.length > 10 ? `${first.slice(0, 10)}...` : first;
  const lastInitial = last ? `${firstLetterUpper(last)}.` : "";

  let name = firstDisplay;
  if (firstDisplay && lastInitial) {
    name = `${firstDisplay} ${lastInitial}`;
  } else if (lastInitial) {
    name = lastInitial;
  }
  if (!name) name = fallback;
  if (place) name += ` (${place})`;
  return name;
}

/** Affiche un contact : si le nom de famille est déjà masqué (null), on garde le libellé serveur. */
export function formatProspectDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallback = "Contact"
): string {
  if (!String(lastName ?? "").trim()) {
    return String(firstName ?? "").trim() || fallback;
  }
  return formatDisplayName(firstName, lastName, fallback);
}

/** Affichage respectueux de la profondeur du réseau. */
export function formatNetworkMemberName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  level: number,
  showFullName = false,
  fallback = "Sans nom"
) {
  if (showFullName || level <= 1) {
    return formatDisplayName(firstName, lastName, fallback);
  }

  const first = capitalizeName(String(firstName ?? "").trim());
  const last = capitalizeName(String(lastName ?? "").trim());
  if (level === 2) {
    if (first && last) return `${first} ${last.charAt(0)}.`;
    return first || (last ? `${last.charAt(0)}.` : fallback);
  }

  const initials = [first, last]
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}.`)
    .join(" ");
  return initials || fallback;
}
