/**
 * Règles d'éligibilité NAF/APE pour l'inscription d'un compte professionnel Winelio.
 * Seules les activités de prestation de service sont autorisées.
 *
 * Source : nomenclature NAF rév. 2 (INSEE).
 * Modification = commit + redéploiement (pas d'éditeur admin pour l'instant).
 */

// Sections autorisées par défaut (toute activité dont le code commence par cette division
// fait partie de cette section — voir DIVISION_TO_SECTION).
export const SECTION_RULES: Record<string, { allowed: boolean; label: string }> = {
  A: { allowed: false, label: "Agriculture, sylviculture, pêche" },
  B: { allowed: false, label: "Industries extractives" },
  C: { allowed: false, label: "Industrie manufacturière" },
  D: { allowed: false, label: "Production et distribution d'électricité, gaz" },
  E: { allowed: false, label: "Production et distribution d'eau, déchets" },
  F: { allowed: true,  label: "Construction / BTP" },
  G: { allowed: false, label: "Commerce ; réparation autos/motos" }, // exceptions ci-dessous
  H: { allowed: true,  label: "Transports et entreposage" },
  I: { allowed: true,  label: "Hébergement et restauration" },
  J: { allowed: true,  label: "Information et communication" },
  K: { allowed: true,  label: "Activités financières et d'assurance" },
  L: { allowed: true,  label: "Activités immobilières" },
  M: { allowed: true,  label: "Activités scientifiques et techniques" },
  N: { allowed: true,  label: "Services administratifs et de soutien" },
  O: { allowed: false, label: "Administration publique" },
  P: { allowed: true,  label: "Enseignement" },
  Q: { allowed: true,  label: "Santé humaine et action sociale" },
  R: { allowed: true,  label: "Arts, spectacles et activités récréatives" },
  S: { allowed: true,  label: "Autres activités de services" },
  T: { allowed: false, label: "Activités des ménages" },
  U: { allowed: false, label: "Activités extra-territoriales" },
};

// Exceptions au niveau du code (ex. réparation auto en G, qui est une presta service).
// Le code retourné par l'API SIRENE peut contenir un point (ex. "45.20A") ou pas.
// On normalise en supprimant le point dans la fonction de check.
export const CODE_OVERRIDES: Record<string, { allowed: boolean; label: string }> = {
  "4520A": { allowed: true, label: "Entretien et réparation de véhicules automobiles légers" },
  "4520B": { allowed: true, label: "Entretien et réparation d'autres véhicules automobiles" },
  "4540Z": { allowed: true, label: "Commerce et réparation de motocycles" },
  "4778C": { allowed: true, label: "Optique-lunetterie (commerce de détail)" },
};

// Mapping division (2 premiers chiffres du code NAF) → section.
// Source : nomenclature NAF rév. 2 (INSEE).
const DIVISION_TO_SECTION: Record<string, string> = {
  "01": "A", "02": "A", "03": "A",
  "05": "B", "06": "B", "07": "B", "08": "B", "09": "B",
  "10": "C", "11": "C", "12": "C", "13": "C", "14": "C", "15": "C", "16": "C", "17": "C",
  "18": "C", "19": "C", "20": "C", "21": "C", "22": "C", "23": "C", "24": "C", "25": "C",
  "26": "C", "27": "C", "28": "C", "29": "C", "30": "C", "31": "C", "32": "C", "33": "C",
  "35": "D",
  "36": "E", "37": "E", "38": "E", "39": "E",
  "41": "F", "42": "F", "43": "F",
  "45": "G", "46": "G", "47": "G",
  "49": "H", "50": "H", "51": "H", "52": "H", "53": "H",
  "55": "I", "56": "I",
  "58": "J", "59": "J", "60": "J", "61": "J", "62": "J", "63": "J",
  "64": "K", "65": "K", "66": "K",
  "68": "L",
  "69": "M", "70": "M", "71": "M", "72": "M", "73": "M", "74": "M", "75": "M",
  "77": "N", "78": "N", "79": "N", "80": "N", "81": "N", "82": "N",
  "84": "O",
  "85": "P",
  "86": "Q", "87": "Q", "88": "Q",
  "90": "R", "91": "R", "92": "R", "93": "R",
  "94": "S", "95": "S", "96": "S",
  "97": "T", "98": "T",
  "99": "U",
};

export interface NafCheckResult {
  allowed: boolean;
  code: string;
  section: string | null;
  reason: string;
}

/**
 * Normalise un code NAF en supprimant points et espaces, et le passe en majuscules.
 * Ex. "45.20A" → "4520A", " 90.01z " → "9001Z"
 */
function normalizeNafCode(code: string): string {
  return code.replace(/[.\s]/g, "").toUpperCase();
}

/**
 * Vérifie si un code NAF/APE est autorisé pour une inscription pro Winelio.
 * Retourne { allowed, section, reason } pour permettre un message clair côté UI.
 */
export function checkNafCode(code: string | null | undefined): NafCheckResult {
  if (!code || !code.trim()) {
    return {
      allowed: false,
      code: "",
      section: null,
      reason: "Aucun code NAF/APE n'a pu être déterminé pour cette entreprise.",
    };
  }

  const normalized = normalizeNafCode(code);
  const division = normalized.slice(0, 2);
  const section = DIVISION_TO_SECTION[division] ?? null;

  // 1. Override par code exact (priorité sur la section)
  const override = CODE_OVERRIDES[normalized];
  if (override) {
    return {
      allowed: override.allowed,
      code: normalized,
      section,
      reason: override.allowed
        ? `Activité éligible (${override.label}).`
        : `Activité non éligible : ${override.label}.`,
    };
  }

  // 2. Sinon section
  if (!section) {
    return {
      allowed: false,
      code: normalized,
      section: null,
      reason: `Code NAF inconnu (${normalized}). Contactez le support si c'est une erreur.`,
    };
  }

  const sectionRule = SECTION_RULES[section];
  return {
    allowed: sectionRule.allowed,
    code: normalized,
    section,
    reason: sectionRule.allowed
      ? `Activité éligible — ${sectionRule.label}.`
      : `Activité non éligible : ${sectionRule.label}. Winelio est réservé aux prestations de service.`,
  };
}
