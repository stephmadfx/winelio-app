/**
 * Échappe les caractères HTML spéciaux pour prévenir les injections XSS dans les templates email.
 */
export function he(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
