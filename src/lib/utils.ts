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
