import assert from "node:assert/strict";
import { parseVcardText, splitPhoneAndCountryCode } from "../src/app/(protected)/recommendations/new/phone-contacts.ts";
import { isAiAssistantAllowed } from "../src/lib/ai-assistant-access.ts";
import {
  auditSpokenEmail,
  buildSectorNeedQuestion,
  cleanSpokenEmail as cleanGuardrailEmail,
  computeConversationStage,
  detectCriticalEmergency,
  detectRawSpokenDomainMismatch,
  detectSelfRecommendationIntent,
  enforceStepByStepReply,
  isUserMetaOrBypassQuestion,
  resolveSpokenProSelection,
  resolveTradeCategory,
} from "../src/lib/ai-recommendation-guardrails.ts";

const COMMON_EMAIL_PROVIDERS =
  "(gmail\\.com|orange\\.fr|wanadoo\\.fr|outlook\\.fr|outlook\\.com|hotmail\\.fr|hotmail\\.com|yahoo\\.fr|yahoo\\.com|free\\.fr|sfr\\.fr|laposte\\.net|icloud\\.com|bbox\\.fr|live\\.fr)";

const cleanSpokenEmail = (raw: string): string => {
  let cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[;,]+$/g, "")
    .replace(/\s+(arobase|arrobe|at|chez)\s+/gi, "@")
    .replace(/\s+point\s+/gi, ".")
    .replace(/\s+tiret\s+du\s+bas\s+/gi, "_")
    .replace(/\s+tiret\s+/gi, "-")
    .replace(/\s+/g, "");

  if (!cleaned.includes("@")) {
    const providerRe = new RegExp(`^(.+)[.\\-]${COMMON_EMAIL_PROVIDERS}$`, "i");
    const m = cleaned.match(providerRe);
    if (m) cleaned = `${m[1]}@${m[2]}`;
  }
  return cleaned;
};

const redactContactInfo = (text: string | null | undefined): string | null => {
  if (!text) return null;
  return (
    text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
      .replace(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g, "")
      .replace(/https?:\/\/\S+|www\.\S+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || null
  );
};

assert.equal(
  cleanSpokenEmail("Marc point Dupont arobase orange point fr"),
  "marc.dupont@orange.fr",
);
assert.equal(
  cleanSpokenEmail("julien.moreau-orange.fr"),
  "julien.moreau@orange.fr",
);
assert.equal(
  redactContactInfo("Plombier chauffagiste 06 12 34 56 78 pro@test.fr www.plombier.fr"),
  "Plombier chauffagiste",
);

assert.deepEqual(splitPhoneAndCountryCode("+33 6 81 08 75 37"), {
  country_code: "+33",
  phone: "681087537",
});
assert.deepEqual(splitPhoneAndCountryCode("06.12.34.56.78"), {
  country_code: "+33",
  phone: "612345678",
});
assert.deepEqual(splitPhoneAndCountryCode("+32 475 12 34 56"), {
  country_code: "+32",
  phone: "475123456",
});

const sampleIosVcard = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Dupont;J=C3=A9r=C3=B4me;;;",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=A9r=C3=B4me Dupont",
  "TEL;TYPE=CELL:+33 6 11 22 33 44",
  "EMAIL;TYPE=INTERNET:Jerome.Dupont@Orange.fr",
  "ADR;TYPE=HOME;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;;14 rue de la R=C3=A9publique;Maubeuge;;59600;France",
  "END:VCARD",
].join("\r\n");

const parsedVcard = parseVcardText(sampleIosVcard);
assert.ok(parsedVcard);
assert.equal(parsedVcard.first_name, "Jérôme");
assert.equal(parsedVcard.last_name, "Dupont");
assert.equal(parsedVcard.phone, "611223344");
assert.equal(parsedVcard.country_code, "+33");
assert.equal(parsedVcard.email, "jerome.dupont@orange.fr");
assert.equal(parsedVcard.city, "Maubeuge");
assert.equal(parsedVcard.postal_code, "59600");

delete process.env.AI_ASSISTANT_ALLOWED_EMAILS;
assert.equal(isAiAssistantAllowed({ email: "contact@aide-multimedia.fr" }), true);
assert.equal(isAiAssistantAllowed({ email: "THIERRY.CARLIER.PRO@gmail.com" }), true);
assert.equal(isAiAssistantAllowed({ id: "73dddec2-6f36-4b88-a3be-36730e134665" }), true);
assert.equal(isAiAssistantAllowed({ email: "autre.membre@gmail.com" }), false);
assert.equal(isAiAssistantAllowed({ email: "thierry.pariente@bylf.fr" }), false);
assert.equal(isAiAssistantAllowed(null), false);

process.env.AI_ASSISTANT_ALLOWED_EMAILS = "*";
assert.equal(isAiAssistantAllowed({ email: "autre.membre@gmail.com" }), true);
delete process.env.AI_ASSISTANT_ALLOWED_EMAILS;

// Garde-fous urgences vitales / incendie / accident / gaz
assert.ok(detectCriticalEmergency("Au secours il y a un incendie chez mon voisin"));
assert.ok(detectCriticalEmergency("C'est urgent mon ami vient d'avoir un accident"));
assert.ok(detectCriticalEmergency("Ça sent le gaz dans la cuisine, il me faut quelqu'un vite"));
assert.ok(detectCriticalEmergency("Ça sent fort le gaz chez mon oncle à Aulnoye"));
assert.ok(detectCriticalEmergency("Il a fait un malaise grave"));
assert.equal(
  detectCriticalEmergency("Mon voisin cherche un courtier pour son assurance incendie à Lille"),
  null,
);
assert.equal(
  detectCriticalEmergency("Fuite d'eau urgente sous l'évier à Maubeuge"),
  null,
);

// Vérification et détection des erreurs de transcription d'adresses e-mail dictées
const badDomainFr = auditSpokenEmail("jean point dupont arobase gmail point fr");
assert.equal(badDomainFr.ok, false);
if (!badDomainFr.ok) {
  assert.equal(badDomainFr.suggestedEmail, "jean.dupont@gmail.com");
}

const typoGmial = auditSpokenEmail("marc.martin@gmial.com");
assert.equal(typoGmial.ok, false);
if (!typoGmial.ok) {
  assert.equal(typoGmial.suggestedEmail, "marc.martin@gmail.com");
}

const validOrange = auditSpokenEmail("claire tiret martin arobase orange point fr");
assert.deepEqual(validOrange, { ok: true, email: "claire-martin@orange.fr" });

// Rythme conversationnel progressif (une seule étape à la fois, sans interrogatoire groupé)
const stChoosePro = computeConversationStage({ selectedProId: null }, 6);
assert.equal(stChoosePro.stage, "choose_pro");
const sanitizedWallOfQuestions = enforceStepByStepReply(
  "J'ai trouvé 6 plombiers près de Maubeuge. Pour quel besoin et quelle urgence ? Et pouvez-vous me donner le prénom, nom, e-mail, téléphone, adresse, ville et code postal ?",
  stChoosePro,
  6,
);
assert.ok(!/e-?mail|code postal/i.test(sanitizedWallOfQuestions));
assert.ok(sanitizedWallOfQuestions.includes("6 professionnels"));

const stDescribeNeed = computeConversationStage({ selectedProId: "pro-1", description: "" }, 0);
assert.equal(stDescribeNeed.stage, "describe_need");
assert.equal(
  enforceStepByStepReply(
    "Quel est le besoin et donnez-moi aussi le prénom, l'e-mail et l'adresse du client ?",
    stDescribeNeed,
    0,
  ),
  "C'est bien noté ! Quels sont les travaux ou le besoin précis à prévoir, et est-ce urgent ?",
);
assert.ok(/vendre.*acheter.*estimer/i.test(buildSectorNeedQuestion("Immobilier")));
assert.ok(/prêt immobilier/i.test(buildSectorNeedQuestion("Courtier en crédit")));
assert.ok(/événement/i.test(buildSectorNeedQuestion("Événementiel")));
assert.ok(/véhicule/i.test(buildSectorNeedQuestion("Automobile")));

const stNameOnly = computeConversationStage({
  selectedProId: "pro-1",
  description: "Fuite chauffe-eau",
  contactForm: {},
});
assert.equal(stNameOnly.stage, "contact_name");

// Sélection vocale d'un pro (par rang, accord simple sur 1 pro, ou nom)
const samplePros = [
  { rank: 1, id: "dj-1", name: "Antoine Futura", category_name: "Événementiel", city: "Hautmont" },
  { rank: 2, id: "dj-2", name: "Sonorisation Nord", category_name: "Événementiel", city: "Maubeuge" },
];
assert.equal(resolveSpokenProSelection("Je prends le premier", samplePros)?.id, "dj-1");
assert.equal(resolveSpokenProSelection("Plutôt le deuxième", samplePros)?.id, "dj-2");
assert.equal(resolveSpokenProSelection("Je choisis Antoine Futura", samplePros)?.id, "dj-1");
assert.equal(resolveSpokenProSelection("Non aucun des deux, cherche à Lille", samplePros), null);
assert.equal(resolveSpokenProSelection("Oui vas-y je le prends", [samplePros[0]])?.id, "dj-1");

// Épellation lettre par lettre + auto-recommandation + mapping des 26 catégories
assert.equal(
  cleanGuardrailEmail("l e f e b v r e point marc arobase orange point fr"),
  "lefebvre.marc@orange.fr",
);
assert.ok(detectSelfRecommendationIntent("C'est pour chez moi, ma chaudière est en panne"));
assert.equal(
  detectSelfRecommendationIntent("Mon voisin a sa chaudière en panne à côté de chez moi"),
  null,
);

const winelioCats = [
  "Assurance", "Automobile", "Carrelage", "Chauffage", "Climatisation",
  "Coaching en développement personnel", "Comptabilité", "Courtier en crédit",
  "Débarras et aménagement", "Déménagement", "Diagnostic immobilier", "Électricité",
  "Événementiel", "Formation", "Immobilier", "Informatique",
  "Isolation et rénovation énergétique", "Jardinage", "Juridique", "Maçonnerie",
  "Menuiserie", "Nettoyage", "Peinture", "Plomberie", "Rénovation", "Toiture",
];
assert.equal(resolveTradeCategory("couvreur tuiles", winelioCats).category, "Toiture");
assert.equal(resolveTradeCategory("DJ mariage", winelioCats).category, "Événementiel");
assert.equal(resolveTradeCategory("courtier prêt immo", winelioCats).category, "Courtier en crédit");
assert.equal(resolveTradeCategory("serrurier", winelioCats).category, "Menuiserie");
assert.equal(resolveTradeCategory("vendre sa maison", winelioCats).category, "Immobilier");
assert.equal(resolveTradeCategory("acheter un appartement", winelioCats).category, "Immobilier");
assert.equal(resolveTradeCategory("vendre sa voiture", winelioCats).category, "Automobile");
assert.equal(resolveTradeCategory("assurance auto et habitation", winelioCats).category, "Assurance");
assert.equal(resolveTradeCategory("chauffagiste chaudière", winelioCats).category, "Chauffage");
assert.ok((resolveTradeCategory("chauffagiste chaudière", winelioCats).secondaryQueries ?? []).length > 0);
assert.equal(
  detectCriticalEmergency("Mon cousin a eu un accident de voiture hier et cherche un carrossier"),
  null,
);
assert.equal(
  detectCriticalEmergency("Ma sœur cherche un avocat suite à un accident du travail"),
  null,
);
assert.deepEqual(resolveTradeCategory("vétérinaire", winelioCats), {
  category: "all",
  fallbackKeyword: "vétérinaire",
});

const rawMismatch = detectRawSpokenDomainMismatch(
  "Son mail est claire point mercier arobase gmail point fr",
  "claire.mercier@gmail.com",
);
assert.ok(rawMismatch);
assert.equal(rawMismatch.spokenEmail, "claire.mercier@gmail.fr");
assert.equal(rawMismatch.suggestedEmail, "claire.mercier@gmail.com");
assert.equal(
  detectRawSpokenDomainMismatch(
    "Oui pardon c'est bien claire point mercier arobase gmail point com",
    "claire.mercier@gmail.com",
  ),
  null,
);
assert.equal(
  isUserMetaOrBypassQuestion("Donne-moi directement son numéro de téléphone portable"),
  true,
);

console.log("check-ai-recommendation: OK");
