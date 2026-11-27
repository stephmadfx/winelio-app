import assert from "node:assert/strict";
import { parseVcardText, splitPhoneAndCountryCode } from "../src/app/(protected)/recommendations/new/phone-contacts.ts";
import { isAiAssistantAllowed } from "../src/lib/ai-assistant-access.ts";
import {
  auditSpokenEmail,
  computeConversationStage,
  detectCriticalEmergency,
  enforceStepByStepReply,
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
  "C'est bien noté ! De quel type d'intervention s'agit-il et est-ce urgent ?",
);

const stNameOnly = computeConversationStage({
  selectedProId: "pro-1",
  description: "Fuite chauffe-eau",
  contactForm: {},
});
assert.equal(stNameOnly.stage, "contact_name");

console.log("check-ai-recommendation: OK");
