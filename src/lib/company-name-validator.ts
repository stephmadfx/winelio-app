/**
 * Validation des noms d'entreprise (name + legal_name).
 *
 * Refuse :
 *   - les URLs (http://, https://, www.X.Y, ou tout token *.tld)
 *   - les numéros de téléphone (≥ 9 chiffres consécutifs ou
 *     formats FR comme 06 12 34 56 78 / +33 6 12 34 56 78 / 06.12.34.56.78)
 *
 * Ces motifs n'ont rien à faire dans la raison sociale ou le nom commercial :
 * ils relèvent des champs dédiés (`website`, `phone`).
 */

export interface NameValidationResult {
  ok: boolean;
  error?: string;
}

const URL_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/\S+/i,                                       // http(s)://anything
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,                           // www.example.com
  /\b[a-z0-9-]+\.(?:com|fr|net|org|io|app|co|eu|be|ch|info|pro|biz|store|shop|tech|xyz)\b/i, // example.com / mon-site.fr
];

// On compte les chiffres dans la chaîne (en ignorant les séparateurs courants).
// 9 chiffres groupés = numéro FR/international très probable.
function looksLikePhoneNumber(value: string): boolean {
  // Séquence de 9+ chiffres séparés uniquement par espaces, points, tirets, slashs ou parenthèses
  // Ex: "06 12 34 56 78", "+33 6 12 34 56 78", "06.12.34.56.78", "0612345678"
  const phonePattern = /(?:\+?\d[\s.\-/()]*){9,}/;
  return phonePattern.test(value);
}

export function validateCompanyName(value: string | null | undefined, fieldLabel = "nom"): NameValidationResult {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true };

  for (const pattern of URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        error: `Le ${fieldLabel} de l'entreprise ne doit pas contenir d'adresse web. Utilisez le champ "Site web" dédié.`,
      };
    }
  }

  if (looksLikePhoneNumber(trimmed)) {
    return {
      ok: false,
      error: `Le ${fieldLabel} de l'entreprise ne doit pas contenir de numéro de téléphone. Utilisez le champ "Téléphone" dédié.`,
    };
  }

  return { ok: true };
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function validateCompanyDescription(value: string | null | undefined): NameValidationResult {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true };

  if (trimmed.length > 500) {
    return {
      ok: false,
      error: "La présentation est limitée à 500 caractères.",
    };
  }

  if (EMAIL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: "La présentation ne doit pas contenir d'adresse email.",
    };
  }

  for (const pattern of URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        error: "La présentation ne doit pas contenir d'adresse web (URL / site internet).",
      };
    }
  }

  if (looksLikePhoneNumber(trimmed)) {
    return {
      ok: false,
      error: "La présentation ne doit pas contenir de numéro de téléphone.",
    };
  }

  return { ok: true };
}
