import { EMAIL_REGEX } from "@/app/(protected)/recommendations/new/types";

const COMMON_EMAIL_PROVIDERS =
  "(gmail\\.com|orange\\.fr|wanadoo\\.fr|outlook\\.fr|outlook\\.com|hotmail\\.fr|hotmail\\.com|yahoo\\.fr|yahoo\\.com|free\\.fr|sfr\\.fr|laposte\\.net|icloud\\.com|bbox\\.fr|live\\.fr)";

const SUSPECT_DOMAIN_CORRECTIONS: Record<string, string> = {
  "gmail.fr": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmel.com": "gmail.com",
  "jimail.com": "gmail.com",
  "djimail.com": "gmail.com",
  "googlemail.fr": "gmail.com",
  "icloud.fr": "icloud.com",
  "iclou.com": "icloud.com",
  "orang.fr": "orange.fr",
  "oranje.fr": "orange.fr",
  "wanado.fr": "wanadoo.fr",
  "wanadou.fr": "wanadoo.fr",
  "wanadoo.com": "wanadoo.fr",
  "hotmai.fr": "hotmail.fr",
  "hotmai.com": "hotmail.com",
  "outlok.fr": "outlook.fr",
  "outlok.com": "outlook.com",
  "yaho.fr": "yahoo.fr",
  "yaho.com": "yahoo.com",
  "lapost.net": "laposte.net",
  "laposte.fr": "laposte.net",
  "la-poste.net": "laposte.net",
  "fre.fr": "free.fr",
  "free.com": "free.fr",
  "sfr.com": "sfr.fr",
  "bbo.fr": "bbox.fr",
};

const foldText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export type AuditedSpokenEmail =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      cleaned: string;
      suggestedEmail?: string;
      reason: string;
    };

export function cleanSpokenEmail(raw: string): string {
  let cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[;,!?]+$/g, "")
    .replace(/^['"«»]+|['"«»]+$/g, "")
    .replace(/\s+(arobase|arrobe|arobaz|a\s+commercial|at|chez)\s+/gi, "@")
    .replace(/\s+point\s+/gi, ".")
    .replace(/\s+(tiret\s+du\s+bas|underscore|soulign[ée])\s+/gi, "_")
    .replace(/\s+(tiret|trait\s+d['’]union)\s+/gi, "-")
    .replace(/\s+/g, "");

  if (!cleaned.includes("@")) {
    const providerRe = new RegExp(`^(.+)[.\\-]${COMMON_EMAIL_PROVIDERS}$`, "i");
    const m = cleaned.match(providerRe);
    if (m) {
      cleaned = `${m[1]}@${m[2]}`;
    }
  }
  return cleaned;
}

export function auditSpokenEmail(raw: string): AuditedSpokenEmail {
  const cleaned = cleanSpokenEmail(raw);

  if (!cleaned || !EMAIL_REGEX.test(cleaned)) {
    return {
      ok: false,
      cleaned,
      reason: `L'adresse e-mail comprise ("${cleaned || raw.trim()}") est incomplète ou mal transcrite : demande au membre de l'épeler lettre par lettre ou de l'écrire au clavier (une adresse e-mail exacte est indispensable pour que la recommandation soit valable).`,
    };
  }

  const [localPart, domainPart] = cleaned.split("@");
  if (!localPart || !domainPart) {
    return {
      ok: false,
      cleaned,
      reason:
        "Adresse e-mail mal reconnue : demande au membre de l'épeler lettre par lettre ou de la saisir au clavier.",
    };
  }

  // Résidus vocaux collés dans la partie locale (ex: "jeandupontarobasegmail.com" mal coupé ou "pointfr")
  if (/(arobase|arrobe|pointfr|pointcom)$/i.test(localPart) || localPart.length < 2) {
    return {
      ok: false,
      cleaned,
      reason: `Doute de transcription vocale sur "${cleaned}" : demande au membre d'épeler l'adresse e-mail ou de la vérifier au clavier.`,
    };
  }

  const correctedDomain = SUSPECT_DOMAIN_CORRECTIONS[domainPart];
  if (correctedDomain) {
    const suggestedEmail = `${localPart}@${correctedDomain}`;
    return {
      ok: false,
      cleaned,
      suggestedEmail,
      reason: `Domaine e-mail probablement mal transcrit ("${cleaned}"). Demande au membre s'il s'agit bien de "${suggestedEmail}", ou invite-le à épeler l'adresse exacte / la corriger au clavier.`,
    };
  }

  return { ok: true, email: cleaned };
}

const BENIGN_PREVENTIVE_CONTEXT_RE =
  /\b(assurance\s+(incendie|accident|habitation|auto)|detecteur\s+de\s+fumee|alarme\s+incendie|extincteur\w*|normes?\s+incendie|securite\s+incendie|porte\s+coupe[\s-]feu|ramonage|entretien\s+chaudiere|revision\s+chaudiere|diagnostic\s+gaz|devis\s+apres\s+(sinistre|incendie|accident)|nettoyage\s+apres\s+(sinistre|incendie)|reparation\s+apres\s+accident|suite\s+a\s+un\s+accident\s+ancien|avocat\s+accident|indemnisation|carrossier|carrosserie)\b/;

const CRITICAL_EMERGENCY_PATTERNS: RegExp[] = [
  // Incendie / feu / explosion / gaz / électrocution
  /\b(incendie|en\s+feu|prend\s+feu|pris\s+feu|depart\s+de\s+feu|il\s+y\s+a\s+le\s+feu|ya\s+le\s+feu|maison\s+brule|appartement\s+brule|ca\s+brule|fumee\s+noire|des\s+flammes|explosion|fuite\s+de\s+gaz|odeur\s+de\s+gaz|ca\s+sent\s+le\s+gaz|electrocut\w+|intoxication\s+au\s+monoxyde)\b/,
  // Accident / urgence médicale / vitale
  /\b(accident|blesse\s+grave|personne\s+blessee|inconscient\w*|ne\s+respire\s+plus|arret\s+cardiaque|crise\s+cardiaque|infarctus|malaise\s+grave|avc|hemorragie|saigne\s+beaucoup|s['’\s]*etouffe|urgence\s+vitale|urgence\s+medicale|tentative\s+de\s+suicide|overdose|noyade)\b/,
  // Danger sécuritaire immédiat / agression / effondrement
  /\b(agression\s+en\s+cours|cambriolage\s+en\s+cours|intrusion\s+chez|violence\w*\s+conjugale\w*|menace\s+de\s+mort|en\s+danger\s+de\s+mort|effondrement\s+(d['’\s]*immeuble|du\s+toit|de\s+mur)|au\s+secours)\b/,
];

export const EMERGENCY_GUARDRAIL_REPLY =
  "Attention : Winelio est une plateforme de recommandation professionnelle et n'est pas destinée aux situations d'urgence ou de danger immédiat. Appelez sans attendre les services de secours adaptés : le 18 (Sapeurs-pompiers : incendie, fuite de gaz, accident), le 15 (SAMU : urgence médicale), le 17 (Police / Gendarmerie) ou le 112 (numéro d'urgence européen gratuit).";

export function detectCriticalEmergency(userMessage: string): string | null {
  const normalized = foldText(userMessage);
  if (!normalized) return null;

  if (BENIGN_PREVENTIVE_CONTEXT_RE.test(normalized)) {
    // Vérifie qu'il n'y a pas malgré tout un signal d'urgence immédiate ("en cours", "tout de suite", "en feu", "au secours")
    if (!/\b(en\s+cours|en\s+feu|au\s+secours|blesse|inconscient|flammes|explosion)\b/.test(normalized)) {
      return null;
    }
  }

  for (const pattern of CRITICAL_EMERGENCY_PATTERNS) {
    if (pattern.test(normalized)) {
      return EMERGENCY_GUARDRAIL_REPLY;
    }
  }
  return null;
}
