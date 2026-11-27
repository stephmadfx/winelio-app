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

function collapseSpelledLetters(text: string): string {
  // Recolle les séquences d'au moins 3 lettres épelées une par une ("d u p o n t" ou "d-u-p-o-n-t" -> "dupont")
  return text.replace(
    /\b([a-z0-9])(?:[\s-]+([a-z0-9])){2,}\b/gi,
    (match) => match.replace(/[\s-]+/g, ""),
  );
}

export function cleanSpokenEmail(raw: string): string {
  const preCollapsed = collapseSpelledLetters(
    raw
      .trim()
      .toLowerCase()
      .replace(/[;,!?]+$/g, "")
      .replace(/^['"«»]+|['"«»]+$/g, "")
      .replace(/\s+(arobase|arrobe|arobaz|a\s+commercial|at|chez)\s+/gi, " @ ")
      .replace(/\s+point\s+/gi, " . ")
      .replace(/\s+(tiret\s+du\s+bas|underscore|soulign[ée])\s+/gi, " _ ")
      .replace(/\s+(tiret|trait\s+d['’]union)\s+/gi, " - "),
  );

  let cleaned = preCollapsed.replace(/\s+/g, "");

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

const RAW_SPOKEN_SUSPECT_DOMAINS: Array<[RegExp, string, string]> = [
  [/\bgmail\s*(?:\.|point)\s*fr\b/i, "gmail.fr", "gmail.com"],
  [/\b(?:gmial|gmai|jimail|djimail)\s*(?:\.|point)\s*com\b/i, "gmial.com", "gmail.com"],
  [/\bicloud\s*(?:\.|point)\s*fr\b/i, "icloud.fr", "icloud.com"],
  [/\blaposte\s*(?:\.|point)\s*fr\b/i, "laposte.fr", "laposte.net"],
  [/\bwanadoo\s*(?:\.|point)\s*com\b/i, "wanadoo.com", "wanadoo.fr"],
  [/\bsfr\s*(?:\.|point)\s*com\b/i, "sfr.com", "sfr.fr"],
  [/\bfree\s*(?:\.|point)\s*com\b/i, "free.com", "free.fr"],
  [/\bbbox\s*(?:\.|point)\s*com\b/i, "bbox.com", "bbox.fr"],
];

export function detectRawSpokenDomainMismatch(
  userMessage: string,
  candidateEmail: string,
): { spokenEmail: string; suggestedEmail: string; reason: string } | null {
  const norm = foldText(userMessage);
  if (!norm) return null;
  const [localPart] = candidateEmail.toLowerCase().split("@");
  if (!localPart) return null;

  for (const [re, wrongDomain, rightDomain] of RAW_SPOKEN_SUSPECT_DOMAINS) {
    // Si le membre n'a pas déjà corrigé explicitement avec le bon domaine dans la même phrase
    const rightRe = new RegExp(
      `\\b${rightDomain.replace(".", "\\s*(?:\\.|point)\\s*")}\\b`,
      "i",
    );
    if (re.test(norm) && !rightRe.test(norm)) {
      const spokenEmail = `${localPart}@${wrongDomain}`;
      const suggestedEmail = `${localPart}@${rightDomain}`;
      return {
        spokenEmail,
        suggestedEmail,
        reason: `Le membre a dicté "${spokenEmail}" (domaine inexistant ou suspect) : ne valide pas silencieusement et demande-lui s'il s'agit bien de "${suggestedEmail}".`,
      };
    }
  }
  return null;
}

const BENIGN_PREVENTIVE_CONTEXT_RE =
  /\b(assur\w*|mutuelle|prevoyance|courtier|detecteur\s+de\s+fumee|alarme\s+incendie|extincteur\w*|normes?\s+incendie|securite\s+incendie|porte\s+coupe[\s-]feu|ramonage|entretien\s+chaudiere|revision\s+chaudiere|diagnostic\s+gaz|devis|nettoyage\s+apres|reparation|carross\w*|garag\w*|pare[\s-]brise|accrochage|avocat\w*|notaire\w*|jurist\w*|juridique|indemnisation|sinistre|degat\s+des\s+eaux|tempete|hier|semaine\s+derniere|mois\s+dernier|an\s+dernier)\b/;

const CRITICAL_EMERGENCY_PATTERNS: RegExp[] = [
  // Incendie / feu / explosion / gaz / électrocution
  /\b(incendie|en\s+feu|prend\s+feu|pris\s+feu|depart\s+de\s+feu|il\s+y\s+a\s+le\s+feu|ya\s+le\s+feu|maison\s+brule|appartement\s+brule|ca\s+brule|fumee\s+noire|des\s+flammes|explosion|fuite(?:\s+\w+){0,2}\s+de\s+gaz|odeur(?:\s+\w+){0,2}\s+de\s+gaz|ca\s+sent(?:\s+\w+){0,2}\s+le\s+gaz|electrocut\w+|intoxication\s+au\s+monoxyde)\b/,
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
    // Vérifie qu'il n'y a pas malgré tout un signal d'urgence vitale immédiate ("en cours", "en feu", "au secours", "inconscient", "saigne")
    if (
      !/\b(en\s+cours|en\s+feu|au\s+secours|blesse\s+grave|inconscient\w*|ne\s+respire\s+plus|saigne|flammes|explosion|fuite(?:\s+\w+){0,2}\s+de\s+gaz|ca\s+sent(?:\s+\w+){0,2}\s+le\s+gaz)\b/.test(
        normalized,
      )
    ) {
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
  selectedProCategory?: string | null;
  recentProfessionalsCount?: number;
  description?: string;
  urgency?: Urgency;
  selectedContactId?: string | null;
  contactForm?: Partial<ContactFormData>;
};

export function buildSectorNeedQuestion(categoryName?: string | null): string {
  const cat = foldText(categoryName ?? "");
  if (cat === "immobilier") {
    return "C'est bien noté ! S'agit-il de vendre, d'acheter, de faire estimer ou de louer un bien, et quel est son délai ?";
  }
  if (cat === "courtier en credit") {
    return "C'est bien noté ! S'agit-il d'un prêt immobilier, d'un rachat de crédits ou d'un financement pro, et où en est son projet ?";
  }
  if (cat === "assurance") {
    return "C'est bien noté ! Quel type de contrat recherche-t-il (habitation, auto, mutuelle, pro…) et est-ce urgent ?";
  }
  if (cat === "comptabilite") {
    return "C'est bien noté ! S'agit-il d'une création d'entreprise ou du suivi comptable d'une activité, et pour quelle échéance ?";
  }
  if (cat === "juridique") {
    return "C'est bien noté ! Sur quel sujet juridique ou notarial souhaite-t-il être accompagné, et est-ce urgent ?";
  }
  if (cat === "evenementiel") {
    return "C'est bien noté ! De quel événement s'agit-il (mariage, anniversaire, soirée…) et à quelle période aura-t-il lieu ?";
  }
  if (cat === "coaching en developpement personnel" || cat === "formation") {
    return "C'est bien noté ! Sur quel objectif ou quelle formation souhaite-t-il être accompagné ?";
  }
  if (cat === "automobile") {
    return "C'est bien noté ! De quel besoin s'agit-il sur son véhicule (entretien, panne, carrosserie…) et est-ce urgent ?";
  }
  if (cat === "informatique") {
    return "C'est bien noté ! S'agit-il d'un dépannage informatique, d'un site web ou d'un projet pro, et est-ce urgent ?";
  }
  if (cat === "demenagement" || cat === "debarras et amenagement") {
    return "C'est bien noté ! Quel type de logement ou local faut-il déménager ou débarrasser, et pour quelle période ?";
  }
  if (cat === "diagnostic immobilier") {
    return "C'est bien noté ! Est-ce un diagnostic avant vente ou avant location, et dans quel délai ?";
  }
  return "C'est bien noté ! Quels sont les travaux ou le besoin précis à prévoir, et est-ce urgent ?";
}

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
    suggestedQuestion = buildSectorNeedQuestion(state.selectedProCategory);
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
  /\b(pr[ée]nom|nom\s+de\s+famille|e-?mail|courriel|adresse\s+postale|num[ée]ro\s+de\s+t[ée]l[ée]phone)\b/i;

const USER_META_OR_BYPASS_RE =
  /\b(comment\s+ca\s+marche|gratuit|payant|combien|commission|remuner\w*|gagne\w*|obligatoire|pourquoi|pas\s+d['’\s]*e-?mail|pas\s+son\s+(mail|e-?mail|adresse|numero)|rgpd|consentement|quels?\s+metiers?|quelles?\s+categories?|quelle\s+adresse|adresse\s+(?:actuelle|du\s+bien|de\s+la\s+maison)|(?:donne\w*|avoir|communiqu\w*|quel\s+est|transmet\w*)[\s-]+.*(?:numero|telephone|portable|mail|e-?mail|adresse|site)|(?:appel\w*|contact\w*|joindre)\s+(?:direct\w*|en\s+direct|moi[\s-]meme))\b/;

export function isUserMetaOrBypassQuestion(userMessage: string): boolean {
  return USER_META_OR_BYPASS_RE.test(foldText(userMessage));
}

export function enforceStepByStepReply(
  reply: string,
  status: ReturnType<typeof computeConversationStage>,
  surfacedProsCount: number,
  latestUserMessage = "",
): string {
  if (!reply) return status.suggestedQuestion;

  // Si le membre pose une question sur le fonctionnement, l'e-mail, la rémunération ou demande un contact direct, préserver la réponse pédagogique
  if (isUserMetaOrBypassQuestion(latestUserMessage)) {
    return reply;
  }

  if (
    status.stage === "choose_pro" &&
    /\bj['’\s]*ai\s+(s[ée]lectionn[ée]|choisi|retenu)\b/i.test(reply)
  ) {
    return status.suggestedQuestion;
  }

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

const SELF_REFERRAL_PATTERNS: RegExp[] = [
  /\bc['’\s]*est\s+pour\s+moi(?:\s*-?\s*meme)?\b/,
  /\bpour\s+moi\s*-?\s*meme\b/,
  /\bchez\s+moi\b/,
  /\b(ma\s+propre|mon\s+propre)\s+(maison|appartement|logement|voiture|entreprise|societe|toiture|chaudiere)\b/,
  /\bj['’\s]*ai\s+besoin\s+pour\s+moi\b/,
];

const THIRD_PARTY_MENTION_RE =
  /\b(ami\w*|voisin\w*|collegue\w*|client\w*|frere|soeur|mere|pere|parents?|oncle|tante|cousin\w*|fils|fille|beau[\s-]frere|belle[\s-]soeur|proche|quelqu['’\s]*un|patron\w*|employeur|commercant\w*|dirigeant\w*|associe\w*|locataire\w*|proprietaire\w*|vendeur\w*|acquereur\w*|acheteur\w*|conjoint\w*|copain|copine|pote)\b/;

export const SELF_REFERRAL_GUARDRAIL_REPLY =
  "Sur Winelio, une recommandation sert uniquement à mettre en relation quelqu'un de votre entourage (ami, voisin, famille, client) avec un professionnel : vous ne pouvez pas vous recommander vous-même. Est-ce bien pour un proche ?";

export function detectSelfRecommendationIntent(userMessage: string): string | null {
  const normalized = foldText(userMessage);
  if (!normalized || THIRD_PARTY_MENTION_RE.test(normalized)) return null;
  for (const re of SELF_REFERRAL_PATTERNS) {
    if (re.test(normalized)) return SELF_REFERRAL_GUARDRAIL_REPLY;
  }
  return null;
}

export type CandidateProOption = {
  rank: number;
  id: string;
  name: string;
  category_name: string | null;
  city: string | null;
};

const NEGATIVE_CHOICE_RE =
  /\b(aucun|pas\s+celui|pas\s+ceux|un\s+autre|une\s+autre|ailleurs|change\w*|plutot\s+(?:a|sur|vers)\b|non\b)/;

export function resolveSpokenProSelection(
  userMessage: string,
  recentPros: CandidateProOption[] | undefined,
): CandidateProOption | null {
  if (!recentPros || recentPros.length === 0) return null;
  const norm = foldText(userMessage);
  if (!norm || NEGATIVE_CHOICE_RE.test(norm)) return null;

  // 1. Sélection par rang ("le premier", "numéro 2", "le dernier", etc.)
  const ordinalRules: Array<[RegExp, number]> = [
    [/\b(premier|1er|numero\s*1|le\s*1)\b/, 0],
    [/\b(deuxieme|second|2e|2eme|numero\s*2|le\s*2)\b/, 1],
    [/\b(troisieme|3e|3eme|numero\s*3|le\s*3)\b/, 2],
    [/\b(quatrieme|4e|4eme|numero\s*4|le\s*4)\b/, 3],
    [/\b(cinquieme|5e|5eme|numero\s*5|le\s*5)\b/, 4],
    [/\b(sixieme|6e|6eme|numero\s*6|le\s*6)\b/, 5],
  ];
  for (const [re, idx] of ordinalRules) {
    if (re.test(norm) && recentPros[idx]) return recentPros[idx];
  }
  if (/\ble\s+dernier\b/.test(norm)) {
    return recentPros[recentPros.length - 1] ?? null;
  }

  // 2. Accord simple lorsqu'un seul professionnel a été proposé
  if (
    recentPros.length === 1 &&
    /\b(oui|ok|d['’\s]*accord|parfait|tres\s+bien|vas[\s-]y|je\s+(le\s+)?prends|je\s+choisis|celui[\s-]la|ca\s+me\s+va|c['’\s]*est\s+bon|valide)\b/.test(
      norm,
    )
  ) {
    return recentPros[0];
  }

  // 3. Correspondance sur le nom de l'entreprise ou du professionnel proposé
  const STOP_WORDS = new Set([
    "sarl",
    "sas",
    "sasu",
    "eurl",
    "sci",
    "etablissements",
    "ets",
    "entreprise",
    "societe",
    "plomberie",
    "chauffage",
    "electricite",
    "immobilier",
    "evenementiel",
    "renovation",
    "menuiserie",
    "toiture",
    "peinture",
  ]);

  let bestMatch: CandidateProOption | null = null;
  let bestScore = 0;

  for (const pro of recentPros) {
    const proNorm = foldText(pro.name);
    if (!proNorm) continue;
    if (norm.includes(proNorm) && proNorm.length >= 3) {
      return pro;
    }
    const tokens = proNorm
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
    if (tokens.length === 0) continue;
    const matchedTokens = tokens.filter((t) => norm.includes(t));
    if (matchedTokens.length > 0 && matchedTokens.length > bestScore) {
      // Vérifie l'unicité si un seul mot est cité
      const othersSharingToken = recentPros.filter(
        (other) => other.id !== pro.id && matchedTokens.every((t) => foldText(other.name).includes(t)),
      );
      if (othersSharingToken.length === 0) {
        bestScore = matchedTokens.length;
        bestMatch = pro;
      }
    }
  }

  return bestMatch;
}

// Ordre volontaire du plus spécifique au plus large pour éviter toute collision (ex: "assurance auto" -> Assurance, "courtier prêt immobilier" -> Courtier, "vendre sa voiture" -> Automobile avant Immobilier)
const TRADE_SYNONYMS_MAP: Array<[RegExp, string]> = [
  [/\b(assur\w*|mutuelle|prevoyance|decennale|assurance\s+(?:auto|habitation|emprunteur|pro\w*))\b/, "Assurance"],
  [/\b(courtier\w*|credit\w*|pret\s+(?:immo\w*|pro\w*|travaux)|financement|rachat\s+de\s+credit\w*|regroupement\s+de\s+credit\w*|emprunt\w*|taux\s+immo\w*)\b/, "Courtier en crédit"],
  [/\b(diagnosti\w*|\bdpe\b|amiante|plomb|termites|carrez|audit\s+energetique)\b/, "Diagnostic immobilier"],
  [/\b(avocat\w*|notaire\w*|jurist\w*|juridique|huissier|commissaire\s+de\s+justice|droit|divorce|prud['’\s]*hommes|succession|litige)\b/, "Juridique"],
  [/\b(comptab\w*|expert[\s-]comptable|bilan\s+comptable|fiscal\w*|fiche\w*\s+de\s+paie|creation\s+d['’\s]*entreprise|statuts?\s+(?:sas\w*|sarl|eurl|sci))\b/, "Comptabilité"],
  [/\b(auto|automobile|garag\w*|mecan\w*|carross\w*|pneu\w*|pare[\s-]brise|controle\s+technique|vidange|embrayage|distribution|frein\w*|vehicule\w*|voiture\w*)\b/, "Automobile"],
  [/\b(immo\w*|mandataire\w*|negociateur\w*|syndic|gestion\s+locative|viager|(?:vendre|vente|acheter|achat|estim\w*|louer|location)\b.*\b(?:maison\w*|appart\w*|pavillon\w*|bien\w*|terrain\w*|immeuble\w*|studio\w*|villa\w*|logement\w*|local|commerce)|\b(?:maison\w*|appart\w*|pavillon\w*|terrain\w*|bien\w*)\s+a\s+(?:vendre|louer|acheter|estimer))\b/, "Immobilier"],
  [/\b(couvr\w*|toit\w*|tuile\w*|ardoise\w*|zing\w*|gouttiere\w*|charpent\w*|etancheite|velux|demoussage)\b/, "Toiture"],
  [/\b(menuis\w*|fenetre\w*|volet\w*|porte\w*|veranda|pergola|portail\w*|serrur\w*|vitri\w*|cuisine|cuisiniste|parquet\w*|escalier\w*|store\w*)\b/, "Menuiserie"],
  [/\b(plomb\w*|sanitaire\w*|fuite\w*|chauffe[\s-]*eau|cumulus|ballon\s+d['’\s]*eau|canalisation\w*|debouch\w*|robinet\w*|evier|wc|toilette\w*|salle\s+de\s+bain\w*|douche)\b/, "Plomberie"],
  [/\b(clim\w*|frigoriste|gainable|pompe\s+a\s+chaleur|\bpac\b)\b/, "Climatisation"],
  [/\b(chauffag\w*|chaudiere\w*|poele\w*|granules|radiateur\w*|plancher\s+chauffant|ramon\w*)\b/, "Chauffage"],
  [/\b(electri\w*|tableau\s+electrique|prise\w*|disjoncteur\w*|domotique|irve|borne\s+de?\s*recharge|interphone|alarme|panneau\w*\s+solaire\w*|photovoltaique)\b/, "Électricité"],
  [/\b(macon\w*|dalle|beton|fondation\w*|gros\s+oeuvre|parpaing\w*|brique\w*|facade\w*|facadier|ravalement|terrassement|extension\s+maison|ouverture\s+mur)\b/, "Maçonnerie"],
  [/\b(carrel\w*|faience|dallage|chape)\b/, "Carrelage"],
  [/\b(peintr\w*|peinture|enduit|papier\s+peint|tapisserie)\b/, "Peinture"],
  [/\b(isol\w*|comble\w*|laine\s+de|rge|renovation\s+energetique|\bite\b|\biti\b)\b/, "Isolation et rénovation énergétique"],
  [/\b(plaquist\w*|placo\w*|platri\w*|tout\s+corps\s+d['’\s]*etat|second\s+oeuvre|renov\w*|travaux)\b/, "Rénovation"],
  [/\b(jardin\w*|paysag\w*|espaces?\s+verts?|pelouse|tonte|haie\w*|elag\w*|abattage|cloture\w*|terrasse\s+bois|arrosage)\b/, "Jardinage"],
  [/\b(debarras\w*|encombrants|vider\s+(?:une\s+|la\s+|un\s+|son\s+|sa\s+)?(?:maison|appartement|cave|grenier|succession)|vide[\s-]maison|home\s+staging|amenagement)\b/, "Débarras et aménagement"],
  [/\b(demenag\w*|monte[\s-]meuble|garde[\s-]meuble)\b/, "Déménagement"],
  [/\b(menage|aide\s+menagere|nettoy\w*|proprete|vitres|entretien\s+locaux)\b/, "Nettoyage"],
  [/\b(informati\w*|ordinateur\w*|\bpc\b|\bmac\b|site\s+(?:internet|web|vitrine|marchand)|e[\s-]commerce|developpeu\w*|logiciel\w*|cyber\w*|reseau\s+info\w*|depannage\s+info\w*)\b/, "Informatique"],
  [/\b(\bdj\b|degie|mariage\w*|anniversaire\w*|soiree\w*|animateur\w*|animation|sono\w*|traiteur\w*|photographe\w*|videaste\w*|evenement\w*|bapteme|reception|seminaire|wedding\s+planner)\b/, "Événementiel"],
  [/\b(format\w*|cpf|bilan\s+de\s+competences|qualiopi)\b/, "Formation"],
  [/\b(coach\w*|developpement\s+personnel|reconversion|confiance\s+en\s+soi|hypno\w*|sophrolog\w*)\b/, "Coaching en développement personnel"],
];

// Certaines des 26 catégories officielles n'ont pas de fiches dédiées en base mais leurs artisans sont rattachés à une catégorie voisine
const SECONDARY_CATEGORY_FALLBACKS: Record<string, Array<{ category: string; search: string }>> = {
  Chauffage: [
    { category: "Plomberie", search: "chauffag" },
    { category: "Climatisation", search: "chauffag" },
  ],
  Rénovation: [
    { category: "all", search: "rénov" },
    { category: "all", search: "renov" },
  ],
  "Isolation et rénovation énergétique": [
    { category: "all", search: "isolation" },
    { category: "all", search: "isol" },
  ],
  Carrelage: [{ category: "all", search: "carrel" }],
  "Débarras et aménagement": [
    { category: "all", search: "débarras" },
    { category: "all", search: "debarras" },
  ],
  Formation: [
    { category: "all", search: "formation" },
    { category: "Coaching en développement personnel", search: "" },
  ],
  "Diagnostic immobilier": [{ category: "Immobilier", search: "diagnostic" }],
};

export function resolveTradeCategory(
  input: string | undefined,
  categoryNames: string[],
): {
  category: string;
  fallbackKeyword: string | null;
  secondaryQueries?: Array<{ category: string; search: string }>;
} {
  const raw = (input ?? "").trim();
  const target = foldText(raw);
  if (!target || target === "all" || target === "toutes" || target === "tous") {
    return { category: "all", fallbackKeyword: null };
  }

  const exact = categoryNames.find((c) => foldText(c) === target);
  if (exact) {
    return {
      category: exact,
      fallbackKeyword: null,
      secondaryQueries: SECONDARY_CATEGORY_FALLBACKS[exact],
    };
  }

  for (const [re, canonical] of TRADE_SYNONYMS_MAP) {
    if (re.test(target)) {
      const found =
        categoryNames.find((c) => foldText(c) === foldText(canonical)) ?? canonical;
      return {
        category: found,
        fallbackKeyword: null,
        secondaryQueries: SECONDARY_CATEGORY_FALLBACKS[found],
      };
    }
  }

  const partial = categoryNames.find(
    (c) => foldText(c).includes(target) || target.includes(foldText(c)),
  );
  if (partial) {
    return {
      category: partial,
      fallbackKeyword: null,
      secondaryQueries: SECONDARY_CATEGORY_FALLBACKS[partial],
    };
  }

  // Métier hors des 26 catégories officielles : filtrer via p_search pour ne jamais renvoyer 6 plombiers hors-sujet
  return { category: "all", fallbackKeyword: raw };
}

export function isGenericPlaceholderDescription(desc: string): boolean {
  const norm = foldText(desc)
    .replace(
      /\s+pour\s+(?:mon|ma|mes|son|sa|ses|un|une|le|la)\s+(?:ami\w*|voisin\w*|collegue\w*|client\w*|frere|soeur|mere|pere|parents?|oncle|tante|cousin\w*|fils|fille|proche|patron\w*|commercant\w*)\b/g,
      "",
    )
    .replace(/\s+(?:a|autour\s+de|pres\s+de|sur|vers|dans)\s+[a-z0-9\s-]+$/, "")
    .trim();
  if (!norm || norm.length < 4) return true;
  // Rejette les simples reformulations vagues du métier sans précision du projet ("Recherche d'un agent immobilier", "Besoin d'un DJ")
  return /^(?:recherche|besoin|cherche|demande|trouver|recommandation)?\s*(?:d['’\s]*un[e]?|de|du|des|pour\s+un[e]?)?\s*(?:dj|animateur\w*|traiteur\w*|photographe\w*|plombier\w*|plomberie|electricien\w*|electricite|chauffagiste\w*|chauffage|clim\w*|frigoriste|couvreur\w*|toiture|charpentier\w*|menuisier\w*|menuiserie|serrurier\w*|vitrier\w*|macon\w*|maconnerie|peintre\w*|peinture|carreleur\w*|carrelage|plaquiste\w*|jardinier\w*|paysagiste\w*|jardinage|demenageur\w*|demenagement|nettoyage|debarras|courtier\w*|assureur\w*|assurance|comptable\w*|expert[\s-]comptable|avocat\w*|notaire\w*|juriste\w*|garagiste\w*|mecanicien\w*|carrossier\w*|informaticien\w*|coach\w*|formateur\w*|formation|diagnostiqueur\w*|agent\s+immobilier|conseiller\s+immobilier|mandataire\s+immobilier|agence\s+immobiliere|immobilier|evenementiel|professionnel\w*|artisan\w*|prestataire\w*)$/.test(
    norm,
  );
}
