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
