import {
  type ContactFormData,
  EMAIL_REGEX,
  type Urgency,
} from "@/app/(protected)/recommendations/new/types";

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

export type ConversationStage =
  | "search_pro"
  | "choose_pro"
  | "describe_need"
  | "contact_name"
  | "contact_reach"
  | "contact_address"
  | "complete";

export type DraftStageInput = {
  selectedProId?: string | null;
  recentProfessionalsCount?: number;
  description?: string;
  urgency?: Urgency;
  selectedContactId?: string | null;
  contactForm?: Partial<ContactFormData>;
};

export function computeConversationStage(
  state: DraftStageInput,
  surfacedProsCount = 0,
): {
  stage: ConversationStage;
  missingFields: string[];
  suggestedQuestion: string;
} {
  const proId = state.selectedProId ?? null;
  const desc = (state.description ?? "").trim();
  const contactId = state.selectedContactId ?? null;
  const cf = state.contactForm ?? {};

  const missingFields: string[] = [];
  if (!proId) missingFields.push("professionnel");
  if (!desc) missingFields.push("description du besoin");

  if (!contactId) {
    if (!cf.first_name?.trim()) missingFields.push("prénom");
    if (!cf.last_name?.trim()) missingFields.push("nom");
    if (!cf.email?.trim()) missingFields.push("e-mail");
    if (!cf.phone?.trim()) missingFields.push("téléphone");
    if (!cf.address?.trim()) missingFields.push("adresse (numéro et rue)");
    if (!cf.city?.trim()) missingFields.push("ville");
    if (!cf.postal_code?.trim()) missingFields.push("code postal");
  }

  const personLabel = cf.first_name?.trim() || "cette personne";
  const candidateProsCount = surfacedProsCount || (state.recentProfessionalsCount ?? 0);

  let stage: ConversationStage = "complete";
  let suggestedQuestion =
    "Tout est complet ! Il ne vous reste plus qu'à cocher la case de consentement RGPD et appuyer sur « Envoyer la recommandation ».";

  if (!proId) {
    if (candidateProsCount > 0) {
      stage = "choose_pro";
      suggestedQuestion =
        candidateProsCount === 1
          ? "J'ai trouvé 1 professionnel correspondant. Souhaitez-vous le choisir ?"
          : `J'ai trouvé ${candidateProsCount} professionnels dans ce secteur. Lequel souhaitez-vous choisir ?`;
    } else {
      stage = "search_pro";
      suggestedQuestion =
        "Quel type de professionnel recherchez-vous et autour de quelle ville ?";
    }
  } else if (!desc) {
    stage = "describe_need";
    suggestedQuestion =
      "C'est bien noté ! De quel type d'intervention s'agit-il et est-ce urgent ?";
  } else if (!contactId) {
    if (!cf.first_name?.trim() || !cf.last_name?.trim()) {
      stage = "contact_name";
      suggestedQuestion =
        "Parfait ! Quel est le prénom et le nom de la personne pour qui vous faites cette recommandation ?";
    } else if (!cf.phone?.trim() && !cf.email?.trim()) {
      stage = "contact_reach";
      suggestedQuestion = `C'est noté pour ${personLabel} ! Quels sont son numéro de téléphone et son adresse e-mail ?`;
    } else if (!cf.email?.trim()) {
      stage = "contact_reach";
      suggestedQuestion = `Merci ! Quelle est l'adresse e-mail de ${personLabel} ?`;
    } else if (!cf.phone?.trim()) {
      stage = "contact_reach";
      suggestedQuestion = `Merci ! Quel est le numéro de téléphone de ${personLabel} ?`;
    } else if (!cf.address?.trim() || !cf.city?.trim() || !cf.postal_code?.trim()) {
      stage = "contact_address";
      const missingAddrParts = [
        !cf.address?.trim() ? "numéro et rue" : null,
        !cf.city?.trim() ? "ville" : null,
        !cf.postal_code?.trim() ? "code postal" : null,
      ].filter(Boolean);
      suggestedQuestion = `Dernière information : quelle est l'adresse postale de ${personLabel} (${missingAddrParts.join(", ")}) ?`;
    }
  }

  return { stage, missingFields, suggestedQuestion };
}

const CONTACT_INTERROGATION_RE =
  /\b(pr[ée]nom|nom\s+de\s+famille|e-?mail|courriel|adresse\s+postale|code\s+postal|num[ée]ro\s+de\s+t[ée]l[ée]phone)\b/i;

export function enforceStepByStepReply(
  reply: string,
  status: ReturnType<typeof computeConversationStage>,
  surfacedProsCount: number,
): string {
  if (!reply) return status.suggestedQuestion;

  if (
    (status.stage === "search_pro" ||
      status.stage === "choose_pro" ||
      status.stage === "describe_need") &&
    CONTACT_INTERROGATION_RE.test(reply)
  ) {
    if (surfacedProsCount > 0 && status.stage === "choose_pro") {
      return surfacedProsCount === 1
        ? "J'ai trouvé 1 professionnel correspondant. Touchez « Choisir » ou dites-moi si vous souhaitez le sélectionner."
        : `J'ai trouvé ${surfacedProsCount} professionnels dans ce secteur. Touchez « Choisir » sur celui qui vous convient, ou dites-moi son nom au micro.`;
    }
    return status.suggestedQuestion;
  }

  if (
    status.stage === "contact_name" &&
    /\b(e-?mail|courriel)\b/i.test(reply) &&
    /\b(adresse|code\s+postal)\b/i.test(reply)
  ) {
    return status.suggestedQuestion;
  }

  if (
    status.stage === "contact_reach" &&
    /\b(num[ée]ro\s+et\s+rue|adresse\s+postale|code\s+postal)\b/i.test(reply)
  ) {
    return status.suggestedQuestion;
  }

  return reply;
}
