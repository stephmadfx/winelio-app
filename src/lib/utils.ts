import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallback = "Utilisateur"
) {
  const name = [firstName, lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return name || fallback;
}
