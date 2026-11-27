import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAiAssistantAllowed } from "@/lib/ai-assistant-access";
import {
  auditSpokenEmail,
  computeConversationStage,
  detectCriticalEmergency,
  detectRawSpokenDomainMismatch,
  detectSelfRecommendationIntent,
  enforceStepByStepReply,
  isGenericPlaceholderDescription,
  isUserMetaOrBypassQuestion,
  resolveSpokenProSelection,
  resolveTradeCategory,
} from "@/lib/ai-recommendation-guardrails";
import { fakeLastActive } from "@/lib/fake-last-active";
import {
  type Contact,
  type ContactFormData,
  type Professional,
  type Urgency,
} from "@/app/(protected)/recommendations/new/types";

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];
const MISTRAL_MODEL = "mistral-small-latest";
const GROQ_FALLBACK_MODELS: { id: string; lowReasoning?: boolean }[] = [
  { id: "openai/gpt-oss-120b", lowReasoning: true },
  { id: "qwen/qwen3.8-27b" },
  { id: "openai/gpt-oss-20b", lowReasoning: true },
];

let mistralChatBillingInactive = false;
const modelCooldownUntil = new Map<string, number>();

function isModelAvailable(key: string): boolean {
  const until = modelCooldownUntil.get(key);
  if (!until) return true;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(key);
    return true;
  }
  return false;
}

async function callLlmWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiMessages: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
  round: number,
  requireFirstRoundTool: boolean,
  geminiKey?: string,
  mistralKey?: string,
  groqKey?: string,
  retriedAfterSaturation = false,
): Promise<Response | null> {
  const allowTools = round < 4;

  if (geminiKey) {
    const geminiToolChoice = round === 0 && requireFirstRoundTool ? "required" : "auto";
    for (const model of GEMINI_MODELS) {
      const cacheKey = `gemini:${model}`;
      if (!isModelAvailable(cacheKey)) continue;
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${geminiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: apiMessages,
            ...(allowTools ? { tools, tool_choice: geminiToolChoice } : {}),
            temperature: 0.2,
            max_tokens: 800,
          }),
          signal: AbortSignal.timeout(5500),
        },
      ).catch(() => null);

      if (res && res.ok) return res;
      if (!res || res.status === 429 || res.status === 404 || res.status >= 500) {
        modelCooldownUntil.set(cacheKey, Date.now() + (res?.status === 404 ? 600_000 : 25_000));
      } else if (res.status === 400 && round === 0 && requireFirstRoundTool) {
        // Si le modèle refuse légitimement d'appeler un outil (ex: garde-fou ou question), retenter en auto
        const retryAuto = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geminiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              tools,
              tool_choice: "auto",
              temperature: 0.2,
              max_tokens: 800,
            }),
            signal: AbortSignal.timeout(5500),
          },
        ).catch(() => null);
        if (retryAuto && retryAuto.ok) return retryAuto;
      }
    }
  }

  if (mistralKey && !mistralChatBillingInactive && isModelAvailable("mistral")) {
    const mistralToolChoice = round === 0 && requireFirstRoundTool ? "any" : "auto";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: apiMessages,
        ...(allowTools ? { tools, tool_choice: mistralToolChoice } : {}),
        temperature: 0.2,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (res && res.ok) {
      return res;
    }
    if (res?.status === 402) {
      mistralChatBillingInactive = true;
    } else if (res?.status === 429) {
      modelCooldownUntil.set("mistral", Date.now() + 25_000);
    }
  }

  if (groqKey) {
    const groqToolChoice = round === 0 && requireFirstRoundTool ? "required" : "auto";
    let lastRes: Response | null = null;
    for (const m of GROQ_FALLBACK_MODELS) {
      const cacheKey = `groq:${m.id}`;
      if (!isModelAvailable(cacheKey)) continue;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: m.id,
          ...(m.lowReasoning ? { reasoning_effort: "low" } : {}),
          messages: apiMessages,
          ...(allowTools ? { tools, tool_choice: groqToolChoice } : {}),
          temperature: 0.2,
          max_completion_tokens: 700,
        }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);

      if (res && res.ok) return res;
      if (!res || res.status === 429 || res.status === 404 || res.status >= 500) {
        modelCooldownUntil.set(cacheKey, Date.now() + (res?.status === 404 ? 600_000 : 20_000));
      } else if (res.status === 400 && round === 0 && requireFirstRoundTool) {
        const retryAuto = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: m.id,
            ...(m.lowReasoning ? { reasoning_effort: "low" } : {}),
            messages: apiMessages,
            tools,
            tool_choice: "auto",
            temperature: 0.2,
            max_completion_tokens: 700,
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        if (retryAuto && retryAuto.ok) return retryAuto;
      }
      lastRes = res;
    }
    if (lastRes && lastRes.ok) return lastRes;
  }

  if (!retriedAfterSaturation && modelCooldownUntil.size > 0) {
    await new Promise((r) => setTimeout(r, 3000));
    for (const [k, until] of modelCooldownUntil.entries()) {
      if (until - Date.now() < 60_000) modelCooldownUntil.delete(k);
    }
    return callLlmWithFallback(
      apiMessages,
      tools,
      round,
      requireFirstRoundTool,
      geminiKey,
      mistralKey,
      groqKey,
      true,
    );
  }

  return null;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

type RecentProSummary = {
  rank: number;
  id: string;
  name: string;
  category_name: string | null;
  city: string | null;
};

type DraftInput = {
  selectedProId: string | null;
  selectedProLabel?: string | null;
  selectedProCategory?: string | null;
  recentProfessionals?: RecentProSummary[];
  description: string;
  urgency: Urgency;
  selectedContactId: string | null;
  selectedContactLabel?: string | null;
  createContact: boolean;
  contactForm: ContactFormData;
};

type DraftPatch = {
  selectedProId?: string | null;
  selectedPro?: Professional | null;
  description?: string;
  urgency?: Urgency;
  selectedContactId?: string | null;
  createContact?: boolean;
  contactForm?: Partial<ContactFormData>;
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BYPASS_PATTERNS = [
  /pages?\s*jaunes/i,
  /recherch(er|ez|ant)\s+sur\s+(google|internet)/i,
  /trouver\s+(son|leur|le)\s+num[ée]ro\s+sur/i,
  /(contacter|appeler|joindre)\s+directement\s+le\s+pro/i,
  /https?:\/\//i,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
];

function sanitizeAssistantReply(reply: string): string {
  const trimmed = reply
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .trim()
    .replace(/\bvous recontact(era|er|e)\b/gi, (_, suffix: string) =>
      suffix.toLowerCase() === "er" ? "recontacter votre proche" : `recontact${suffix.toLowerCase()} votre proche`,
    );
  if (!trimmed) return "";
  if (BYPASS_PATTERNS.some((re) => re.test(trimmed))) {
    return "Sur Winelio, la mise en relation passe exclusivement par l'application : choisissez le professionnel, complétez les coordonnées de votre proche et envoyez la recommandation afin que le professionnel le recontacte et que votre commission soit garantie.";
  }
  return trimmed;
}

function redactContactInfo(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
    .replace(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g, "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || null;
}

const PREMATURE_COMPLETION_RE =
  /consentement|rgpd|envoyer la recommandation|tout est complet|pr[êe]t[es]? [àa] [êe]tre envoy/i;

function computeMissingState(
  draft: DraftInput | undefined,
  patch: DraftPatch,
  surfacedProsCount = 0,
) {
  const effectiveProId =
    patch.selectedProId !== undefined ? patch.selectedProId : draft?.selectedProId;
  const effectiveProCategory = effectiveProId
    ? patch.selectedPro?.category_name ??
      draft?.recentProfessionals?.find((rp) => rp.id === effectiveProId)?.category_name ??
      draft?.selectedProCategory ??
      null
    : null;
  return computeConversationStage(
    {
      selectedProId: effectiveProId,
      selectedProCategory: effectiveProCategory,
      recentProfessionalsCount: draft?.recentProfessionals?.length ?? 0,
      description: patch.description ?? draft?.description ?? "",
      urgency: patch.urgency ?? draft?.urgency,
      selectedContactId:
        patch.selectedContactId !== undefined ? patch.selectedContactId : draft?.selectedContactId,
      contactForm: {
        ...(draft?.contactForm ?? {}),
        ...(patch.contactForm ?? {}),
      },
    },
    surfacedProsCount,
  );
}

function cleanSpokenPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^0[1-9]\d{8}$/.test(digits)) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return raw.trim();
}

async function geocodeCommune(
  query: string,
): Promise<{ lat: number; lng: number; nom: string; postalCode: string | null } | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  const isPostal = /^\d{5}$/.test(trimmed);
  const params = new URLSearchParams({
    fields: "nom,codesPostaux,centre,population",
    boost: "population",
    limit: "15",
  });
  if (isPostal) params.set("codePostal", trimmed);
  else params.set("nom", trimmed);

  const res = await fetch(`https://geo.api.gouv.fr/communes?${params.toString()}`, {
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (res && res.ok) {
    const data = (await res.json().catch(() => null)) as
      | {
          nom: string;
          population?: number;
          codesPostaux?: string[];
          centre?: { coordinates?: [number, number] };
        }[]
      | null;
    const valid = (data ?? []).filter((c) => c.centre?.coordinates?.length === 2);
    if (isPostal && valid.length > 1) {
      valid.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    }
    const hit = valid[0];
    if (hit?.centre?.coordinates) {
      const [lng, lat] = hit.centre.coordinates;
      return {
        lat,
        lng,
        nom: hit.nom,
        postalCode: isPostal ? trimmed : (hit.codesPostaux?.[0] ?? null),
      };
    }
  }

  // Secours phonétique via la Base Adresse Nationale (ex: "Haute-Mont" -> "Hautmont")
  const banRes = await fetch(
    `https://api-adresse.data.gouv.fr/search/?${new URLSearchParams({
      q: trimmed,
      type: "municipality",
      limit: "1",
    }).toString()}`,
    { signal: AbortSignal.timeout(4000) },
  ).catch(() => null);
  if (!banRes || !banRes.ok) return null;
  const banJson = (await banRes.json().catch(() => null)) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: { city?: string; postcode?: string };
    }[];
  } | null;
  const feat = banJson?.features?.[0];
  if (!feat?.geometry?.coordinates || !feat.properties?.city) return null;
  const [lng, lat] = feat.geometry.coordinates;
  return {
    lat,
    lng,
    nom: feat.properties.city,
    postalCode: feat.properties.postcode ?? null,
  };
}

export async function POST(req: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isAiAssistantAllowed(user)) {
    return NextResponse.json({ error: "Fonctionnalité réservée aux comptes pilotes." }, { status: 403 });
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!geminiKey && !mistralKey && !groqKey) {
    return NextResponse.json(
      { error: "Assistant IA non configuré côté serveur (GEMINI_API_KEY / MISTRAL_API_KEY / GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    messages?: ChatMessage[];
    draft?: DraftInput;
    userLocation?: { lat: number; lng: number } | null;
  } | null;

  const incomingMessages = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));

  if (incomingMessages.length === 0) {
    return NextResponse.json({ error: "Aucun message fourni." }, { status: 400 });
  }

  // Garde-fou déterministe prioritaire : urgences vitales / incendie / accident / fuite de gaz
  const latestUserMessage =
    [...incomingMessages].reverse().find((m) => m.role === "user")?.content ?? "";
  const emergencyReply = detectCriticalEmergency(latestUserMessage);
  if (emergencyReply) {
    return NextResponse.json(
      { reply: emergencyReply },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const selfReferralReply = detectSelfRecommendationIntent(latestUserMessage);
  if (selfReferralReply) {
    return NextResponse.json(
      { reply: selfReferralReply },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [categoriesRes, profileRes] = await Promise.all([
    db.from("categories").select("name").order("name"),
    db.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
  ]);

  const categoryNames = (categoriesRes.data ?? []).map((c: { name: string }) => c.name);
  const accountEmail = (user.email ?? "").trim().toLowerCase();
  const memberFirstName = profileRes.data?.first_name ?? "";
  const draft = body?.draft;

  const patch: DraftPatch = {};
  let surfacedPros: Professional[] | undefined;
  let surfacedContacts: Contact[] | undefined;
  let deviceContactSearchQuery: string | undefined;
  let justCapturedSpokenEmail: string | undefined;
  let justCapturedSpokenName: string | undefined;
  let rejectedEmailFallback: { suggested?: string; message: string } | undefined;
  const lastSearchedPros = new Map<string, Professional>();
  for (const rp of draft?.recentProfessionals ?? []) {
    if (rp.id) {
      lastSearchedPros.set(rp.id, {
        id: rp.id,
        first_name: null,
        last_name: null,
        company_name: rp.name,
        category_name: rp.category_name,
        city: rp.city,
        latitude: null,
        longitude: null,
        distance: null,
        avg_rating: null,
        review_count: 0,
        is_claimed: false,
        last_active_at: new Date().toISOString(),
      });
    }
  }

  // Résolution déterministe immédiate si le membre désigne un pro proposé récemment ("le premier", "oui", ou son nom)
  const preSelectedPro = !draft?.selectedProId
    ? resolveSpokenProSelection(latestUserMessage, draft?.recentProfessionals)
    : null;
  if (preSelectedPro) {
    patch.selectedProId = preSelectedPro.id;
    if (lastSearchedPros.has(preSelectedPro.id)) {
      patch.selectedPro = lastSearchedPros.get(preSelectedPro.id)!;
    }
    // Court-circuit instantané (0 appel LLM) si le message ne contient que le choix du professionnel
    const strippedChoice = fold(latestUserMessage)
      .replace(fold(preSelectedPro.name), "")
      .replace(
        /\b(je|le|la|les|choisis|prends|selectionne|retenir|opte|pour|plutot|premier|1er|deuxieme|second|2e|2eme|troisieme|3e|3eme|quatrieme|cinquieme|sixieme|dernier|numero|oui|ok|d['’\s]*accord|parfait|tres\s+bien|vas[\s-]y|celui[\s-]la|ca\s+me\s+va|c['’\s]*est\s+bon|valide|[1-6])\b/g,
        " ",
      )
      .replace(/[^a-z0-9]/g, "")
      .trim();
    if (strippedChoice.length <= 3 && !isUserMetaOrBypassQuestion(latestUserMessage)) {
      const afterPick = computeMissingState(draft, patch, 0);
      const cleanQuestion = afterPick.suggestedQuestion.replace(
        /^(?:Parfait|Merci|C'est (?:bien )?noté(?:\s+pour\s+[^!]+)?)\s*!\s*/i,
        "",
      );
      return NextResponse.json(
        {
          reply: `C'est bien noté pour ${preSelectedPro.name} ! ${cleanQuestion}`,
          patch,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const initialStatus = computeMissingState(draft, patch);

  const effectiveSelectedProId = patch.selectedProId ?? draft?.selectedProId ?? null;
  const effectiveSelectedProLabel = preSelectedPro
    ? preSelectedPro.name
    : draft?.selectedProLabel || "Sélectionné";

  const draftSummary = draft
    ? JSON.stringify({
        pro_choisi: effectiveSelectedProId
          ? `${effectiveSelectedProLabel} (${effectiveSelectedProId})`
          : null,
        pros_proposes_recemment: (draft.recentProfessionals ?? []).slice(0, 6),
        besoin: draft.description || null,
        urgence: draft.urgency,
        contact_existant: draft.selectedContactId
          ? `${draft.selectedContactLabel || "Sélectionné"} (${draft.selectedContactId})`
          : null,
        nouveau_contact: draft.contactForm,
        etape_actuelle: initialStatus.stage,
        prochaine_question_unique: initialStatus.suggestedQuestion,
        gps: Boolean(body?.userLocation),
      })
    : "{}";

  const systemPrompt = `Assistant Winelio. Aide ${memberFirstName || "le membre"} à préparer une recommandation pour un TIERS (c'est la personne recommandée que le professionnel recontactera, jamais le membre lui-même : ne dis jamais "vous recontacter", dis "recontacter votre proche").
GARDE-FOU ABSOLU URGENCES & SÉCURITÉ : Si le membre évoque un incendie, un départ de feu, une fuite de gaz, une électrocution, un accident corporel, un malaise grave, une agression ou un danger immédiat, N'APPELLE AUCUN OUTIL (ni search_professionals ni update_draft) : indique fermement que Winelio n'est pas conçue pour les urgences et qu'il faut appeler immédiatement le 18 (Pompiers), le 15 (SAMU), le 17 (Police) ou le 112.
RÈGLE ABSOLUE DE MISE EN RELATION CACHÉE : Ne donne ni n'invente JAMAIS les coordonnées d'un professionnel (téléphone, e-mail, adresse postale exacte, site web) et ne suggère JAMAIS de chercher ou contacter le pro en direct hors Winelio (ni Google, ni Pages Jaunes, ni appel direct). Si on te les demande, explique que toute mise en relation passe exclusivement par l'envoi de la recommandation sur Winelio pour que le pro recontacte le proche et que la commission du membre soit protégée.
CONNAISSANCES WINELIO (si le membre pose une question) :
- C'est 100 % gratuit et sans engagement pour le proche recommandé.
- Le recommandeur touche 60 % de la commission encaissée par Winelio lorsque l'affaire aboutit et est réglée.
- On ne peut jamais se recommander soi-même (uniquement un tiers : ami, voisin, famille, client).
- Le nom, le téléphone, l'adresse postale et surtout une adresse e-mail exacte du proche sont obligatoires pour valider la recommandation et déclencher le suivi.
- En immobilier (vente, achat, estimation, location), si le bien concerné n'est pas à la même adresse que le domicile actuel du proche, l'adresse postale de la fiche contact est celle où habite le proche et l'emplacement du bien va dans la description du projet.
ADAPTATION INTELLIGENTE À TOUS LES CORPS DE MÉTIER :
Adapte toujours ton vocabulaire au secteur concerné : en Immobilier, parle de projet de vente, d'achat, d'estimation ou de location (jamais de "dépannage") ; en Courtage/Assurance/Comptabilité/Juridique, parle de dossier, contrat ou accompagnement ; en Événementiel, parle d'événement et de date ; en Bâtiment/Auto/Informatique, parle de travaux, d'entretien ou de dépannage.
VÉRIFICATION CRITIQUE DU NOM ET DE L'E-MAIL : Une erreur sur le nom ou surtout sur l'adresse e-mail du proche rend la recommandation non valable. Dès que le membre dicte un nom ou une adresse e-mail :
- répète explicitement dans ta réponse l'adresse e-mail (et le nom) que tu as comprise pour qu'il la vérifie à l'écran ;
- s'il y a la moindre ambiguïté phonétique, homophonie ou erreur signalée par update_draft, demande-lui de l'épeler lettre par lettre, de la corriger au clavier, ou d'utiliser le bouton « Répertoire ».
RYTHME CONVERSATIONNEL STRICT — UNE SEULE ÉTAPE À LA FOIS (INTERDICTION ABSOLUE DE TOUT DEMANDER D'UN COUP) :
Respecte impérativement cet ordre naturel, en ne posant QU'UNE SEULE question courte par message :
- Étape 1 (Professionnel) : cherche avec search_professionals dès que tu as un métier + une ville (ou gps=true). Si le membre mentionne déjà le besoin ("DJ pour un mariage", "fuite d'eau urgente") ou des infos sur le proche (prénom, nom, téléphone, e-mail, rue) dans sa phrase, enregistre-les AUSSI tout de suite via update_draft pour ne jamais les redemander plus tard ! Si sa demande est trop vague (pas de métier clair ou pas de ville), aide-le gentiment à préciser le métier et la ville. Quand un pro est choisi dans pro_choisi, NE REDEMANDE JAMAIS de choisir un pro et N'APPELLE PLUS search_professionals sauf si le membre demande explicitement de changer de ville, de métier ou de professionnel !
- Étape 2 (Type d'intervention & Urgence) : une fois pro_choisi rempli, si besoin est vide, demande UNIQUEMENT le type d'intervention précis et si c'est urgent ("urgent", "normal" ou "flexible"). NE DEMANDE PAS ENCORE les coordonnées du proche !
- Étape 3 (Prénom & Nom du proche) : une fois pro_choisi ET besoin remplis, demande d'abord UNIQUEMENT le prénom et le nom de la personne recommandée (et appelle find_existing_contacts dès qu'un nom est cité).
- Étape 4 (Coordonnées restantes du proche, petit à petit) : demande ensuite seulement son téléphone et son e-mail, PUIS dans un dernier échange son adresse postale (numéro, rue et ville).
INTERDICTION ABSOLUE d'inviter à cocher le consentement RGPD ou de cliquer sur "Envoyer la recommandation" tant que tous les champs (pro, besoin, prénom, nom, téléphone, e-mail, rue, ville, code postal) ne sont pas remplis.
STYLE VOCAL FLUIDE ET COURT : réponds en 1 ou 2 phrases naturelles (maximum 28 mots) et pose UNIQUEMENT la question correspondant à l'étape en cours.
Catégories : ${categoryNames.join(", ")}.
Brouillon : ${draftSummary}`;

  const tools = [
    {
      type: "function",
      function: {
        name: "search_professionals",
        description:
          "Cherche des professionnels Winelio autour d'une ville/code postal (ou de la position GPS active) par catégorie de métier et/ou nom d'entreprise.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "Ville ou code postal à 5 chiffres en France (ex: 'Maubeuge', '59600', 'Lyon'). Laisser vide uniquement si geolocalisation_active est true.",
            },
            category: {
              type: "string",
              description:
                "Catégorie officielle Winelio OU nom exact du métier demandé par le membre (ex: 'Immobilier', 'Plomberie', 'Chauffagiste', 'Vétérinaire'). Ne mets JAMAIS 'all' lorsqu'un métier précis est demandé !",
            },
            company_or_person_name: {
              type: "string",
              description: "Uniquement si le membre cherche un professionnel précis par son nom ou nom de société (ne PAS mettre un nom de métier ici).",
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_existing_contacts",
        description:
          "Vérifie si la personne recommandée existe déjà dans le carnet de contacts Winelio du membre à partir de son prénom ou nom.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Prénom et/ou nom de la personne recommandée.",
            },
          },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_draft",
        description:
          "Met à jour en direct les champs de la recommandation (professionnel sélectionné, besoin, urgence, ou coordonnées du recommandé).",
        parameters: {
          type: "object",
          properties: {
            selected_pro_id: { type: "string", description: "UUID du professionnel choisi." },
            selected_contact_id: { type: "string", description: "UUID d'un contact existant choisi." },
            description: { type: "string", description: "Description synthétique et propre du besoin pour le professionnel." },
            urgency: { type: "string", enum: ["urgent", "normal", "flexible"] },
            first_name: { type: "string", description: "Prénom du recommandé." },
            last_name: { type: "string", description: "Nom de famille du recommandé." },
            email: { type: "string", description: "Adresse e-mail du recommandé." },
            phone: { type: "string", description: "Numéro de téléphone du recommandé." },
            address: { type: "string", description: "Numéro et nom de rue du recommandé." },
            city: { type: "string", description: "Ville du recommandé." },
            postal_code: { type: "string", description: "Code postal du recommandé (5 chiffres)." },
          },
        },
      },
    },
  ];

  const isConversationalOrMeta =
    isUserMetaOrBypassQuestion(latestUserMessage) ||
    /^(bonjour|bonsoir|salut|coucou|merci|ok|d['’\s]*accord)\b/i.test(latestUserMessage.trim()) ||
    /\b(je\s+(ne\s+)?sais\s+pas\s+trop|j['’\s]*hesite|comment\s+faire)\b/.test(
      fold(latestUserMessage),
    );
  const requireFirstRoundTool = !preSelectedPro && !isConversationalOrMeta;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiMessages: any[] = [{ role: "system", content: systemPrompt }, ...incomingMessages];

  for (let round = 0; round < 5; round++) {
    const res = await callLlmWithFallback(
      apiMessages,
      tools,
      round,
      requireFirstRoundTool,
      geminiKey,
      mistralKey,
      groqKey,
    );

    if (!res || !res.ok) {
      const errText = res ? await res.text().catch(() => "") : "";
      console.error("[ai/chat] LLM error:", res?.status, errText.slice(0, 400));
      return NextResponse.json(
        { error: "L'assistant est momentanément indisponible. Vous pouvez continuer via l'onglet Formulaire classique." },
        { status: 502 },
      );
    }

    const completion = await res.json();
    const choice = completion.choices?.[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls;
    apiMessages.push({
      role: "assistant",
      content: typeof choice.content === "string" ? choice.content : "",
      ...(Array.isArray(toolCalls) && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      const rawReply = typeof choice.content === "string" ? choice.content : "";
      let reply = sanitizeAssistantReply(rawReply);
      const currentStatus = computeMissingState(draft, patch, surfacedPros?.length ?? 0);
      if (currentStatus.missingFields.length > 0 && PREMATURE_COMPLETION_RE.test(reply)) {
        reply = currentStatus.suggestedQuestion;
      }
      reply = enforceStepByStepReply(
        reply,
        currentStatus,
        surfacedPros?.length ?? 0,
        latestUserMessage,
      );
      if (surfacedPros !== undefined && surfacedPros.length === 0) {
        if (!/\b(aucun|pas\s+trouv[ée]|introuvable|pas\s+de\s+professionnel|autre\s+ville|ville\s+voisine)\b/i.test(reply)) {
          reply =
            "Je n'ai trouvé aucun professionnel correspondant dans ce secteur sur Winelio. Souhaitez-vous chercher autour d'une ville voisine ou dans une autre catégorie ?";
        }
      } else if (rejectedEmailFallback) {
        const mustContain = rejectedEmailFallback.suggested?.toLowerCase();
        if (mustContain && !reply.toLowerCase().includes(mustContain)) {
          reply = rejectedEmailFallback.message;
        } else if (!mustContain && !/propre|membre|autre\s+personne|[ée]peler|clavier/i.test(reply)) {
          reply = rejectedEmailFallback.message;
        }
      } else if (justCapturedSpokenEmail && !reply.toLowerCase().includes(justCapturedSpokenEmail)) {
        reply = `${reply ? `${reply} ` : ""}J'ai noté l'e-mail ${justCapturedSpokenEmail}${
          justCapturedSpokenName ? ` pour ${justCapturedSpokenName}` : ""
        } : vérifiez bien son orthographe sur la fiche (ou épelez-la / corrigez-la au clavier), car une erreur empêcherait de valider la recommandation.`.trim();
      }
      return NextResponse.json(
        {
          reply: reply || currentStatus.suggestedQuestion,
          professionals: surfacedPros,
          matchedContacts: surfacedContacts,
          deviceContactSearchQuery,
          patch: Object.keys(patch).length > 0 ? patch : undefined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    for (const tc of toolCalls) {
      const fnName = tc.function?.name as string;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = {};
      }

      let toolResult: unknown = { ok: true };

      if (fnName === "search_professionals") {
        // Si un pro proposé récemment vient d'être sélectionné dans ce même message ("Je choisis X"), ne pas relancer une recherche parasite
        if (preSelectedPro) {
          const afterPickStatus = computeMissingState(draft, patch, 0);
          toolResult = {
            already_selected: preSelectedPro.name,
            selected_pro_id: preSelectedPro.id,
            consigne_reponse: `Le professionnel "${preSelectedPro.name}" est déjà sélectionné ! Ne redemande surtout pas de choisir un pro. Pose uniquement : "${afterPickStatus.suggestedQuestion}"`,
          };
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
          continue;
        }

        const locStr = typeof args.location === "string" ? args.location.trim() : "";
        const catStr = typeof args.category === "string" ? args.category : "all";
        const nameStr =
          typeof args.company_or_person_name === "string" && args.company_or_person_name.trim().length >= 2
            ? args.company_or_person_name.trim()
            : null;

        let coords: { lat: number; lng: number; nom: string | null } | null = null;
        if (locStr) {
          const geo = await geocodeCommune(locStr);
          if (geo) coords = { lat: geo.lat, lng: geo.lng, nom: geo.nom };
        } else if (body?.userLocation) {
          coords = { lat: body.userLocation.lat, lng: body.userLocation.lng, nom: null };
        } else if (draft?.contactForm?.postal_code || draft?.contactForm?.city) {
          const fallbackGeo = await geocodeCommune(
            draft.contactForm.postal_code || draft.contactForm.city,
          );
          if (fallbackGeo) coords = { lat: fallbackGeo.lat, lng: fallbackGeo.lng, nom: fallbackGeo.nom };
        }

        if (!coords) {
          toolResult = {
            found: 0,
            error:
              "Ville introuvable ou manquante. Si le membre a déjà indiqué le projet précis (ex: vendre une maison, mariage, fuite), enregistre-le via update_draft(description), puis demande uniquement autour de quelle ville ou quel code postal chercher.",
          };
        } else {
          // Si le membre relance une nouvelle recherche (nouvelle ville ou nouveau métier), libérer l'ancien pro sélectionné
          if (draft?.selectedProId && patch.selectedProId === undefined) {
            patch.selectedProId = null;
            patch.selectedPro = null;
          }

          const rawNameCheck = nameStr ? resolveTradeCategory(nameStr, categoryNames) : null;
          const sanitizedNameStr =
            nameStr && rawNameCheck && rawNameCheck.fallbackKeyword === null ? null : nameStr;
          const effectiveCatInput =
            (!catStr || catStr === "all") && rawNameCheck && rawNameCheck.fallbackKeyword === null
              ? nameStr!
              : catStr;

          let { category: resolvedCategory, fallbackKeyword, secondaryQueries } =
            resolveTradeCategory(effectiveCatInput, categoryNames);

          // Si le LLM a passé category="all" alors que le membre demandait un métier précis, récupérer le métier depuis la phrase du membre
          if (
            resolvedCategory === "all" &&
            !fallbackKeyword &&
            !sanitizedNameStr &&
            !/\btous\s+les\s+(?:pros?|professionnels?|artisans?)\b/.test(fold(latestUserMessage))
          ) {
            const fromMsg = resolveTradeCategory(latestUserMessage, categoryNames);
            const allUserText = incomingMessages
              .filter((m) => m.role === "user")
              .map((m) => m.content)
              .join(" ");
            const fromHistory =
              fromMsg.category !== "all" ? fromMsg : resolveTradeCategory(allUserText, categoryNames);
            if (fromHistory.category !== "all") {
              resolvedCategory = fromHistory.category;
              secondaryQueries = fromHistory.secondaryQueries;
            } else {
              const unlistedMatch = latestUserMessage.match(
                /\b(?:cherche\w*|besoin\s+d['’\s]*|trouver|recommander|faut|pour)\s+(?:un|une|des)\s+([a-zA-ZÀ-ÿ-]{3,})/i,
              );
              if (unlistedMatch?.[1]) {
                fallbackKeyword = unlistedMatch[1].trim();
              }
            }
          }

          const effectiveSearch = sanitizedNameStr ?? fallbackKeyword;
          const MAX_SEARCH_DISTANCE_KM = 80;
          const targetCommuneNorm = coords.nom ? fold(coords.nom) : "";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const filterLocalRows = (rawRows: any[] | null | undefined) => {
            const candidates = (rawRows ?? []).filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any) => {
                if (r.profile_id === user.id) return false;
                if (r.distance_km != null) return Number(r.distance_km) <= MAX_SEARCH_DISTANCE_KM;
                return Boolean(targetCommuneNorm && fold(r.city ?? "") === targetCommuneNorm);
              },
            );
            const close45 = candidates.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any) => r.distance_km != null && Number(r.distance_km) <= 45,
            );
            return (close45.length >= 3 ? close45 : candidates).slice(0, 6);
          };

          const { data: rows, error } = await db.rpc("search_professionals_by_distance", {
            p_latitude: coords.lat,
            p_longitude: coords.lng,
            p_category_name: resolvedCategory,
            p_commune: coords.nom,
            p_search: effectiveSearch,
            p_limit: 50,
          });

          if (error) {
            toolResult = { found: 0, error: "Erreur technique lors de la recherche." };
          } else {
            let filtered = filterLocalRows(rows);

            // Repli intelligent si la catégorie officielle est vide localement mais que ses artisans sont classés dans une catégorie voisine (ex: Chauffagiste -> Plomberie, Rénovation -> Maçonnerie/Peinture)
            if (filtered.length === 0 && !sanitizedNameStr && secondaryQueries?.length) {
              for (const sq of secondaryQueries) {
                const { data: secRows } = await db.rpc("search_professionals_by_distance", {
                  p_latitude: coords.lat,
                  p_longitude: coords.lng,
                  p_category_name: sq.category,
                  p_commune: coords.nom,
                  p_search: sq.search || null,
                  p_limit: 50,
                });
                const secFiltered = filterLocalRows(secRows);
                if (secFiltered.length > 0) {
                  filtered = secFiltered;
                  break;
                }
              }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = filtered.map((r: any) => r.profile_id as string);
            const ratingsMap = new Map<string, { avg_rating: number | null; review_count: number }>();
            if (ids.length > 0) {
              const { data: rData } = await db
                .from("professional_review_summaries")
                .select("professional_id,avg_rating,review_count")
                .in("professional_id", ids);
              for (const r of rData ?? []) {
                ratingsMap.set(r.professional_id, r);
              }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: Professional[] = filtered.map((p: any) => {
              const rating = ratingsMap.get(p.profile_id);
              const pro: Professional = {
                id: p.profile_id,
                first_name: p.first_name,
                last_name: p.last_name,
                company_name: redactContactInfo(p.company_name) ?? p.company_name ?? null,
                category_name: p.category_name ?? null,
                city: p.city ?? null,
                // Coordonnées GPS exactes masquées côté client pour protéger la mise en relation
                latitude: null,
                longitude: null,
                distance: p.distance_km != null ? Number(p.distance_km) : null,
                avg_rating: rating?.avg_rating != null ? Number(rating.avg_rating) : null,
                review_count: Number(rating?.review_count ?? 0),
                is_claimed: p.company_source === "owner",
                last_active_at: fakeLastActive(p.profile_id),
                company_source: p.company_source ?? null,
                company_description: redactContactInfo(p.company_description),
                geo_precision: p.geo_precision ?? null,
              };
              lastSearchedPros.set(pro.id, pro);
              return pro;
            });

            surfacedPros = mapped;
            toolResult = {
              searched_around: coords.nom ?? "position actuelle",
              category_used: resolvedCategory,
              count: mapped.length,
              professionals: mapped.map((p, idx) => ({
                rank: idx + 1,
                id: p.id,
                name: p.company_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
                category: p.category_name,
                city: p.city,
                distance_km: p.distance != null ? Math.round(p.distance) : null,
                verified: p.is_claimed,
                avg_rating: p.avg_rating,
              })),
              consigne_reponse:
                mapped.length > 0
                  ? `Annonce simplement en 1 phrase courte que tu as trouvé ${mapped.length} professionnel(s) et invite le membre à en choisir un. NE DEMANDE SURTOUT PAS le nom, prénom, e-mail, téléphone ou adresse maintenant.`
                  : "Aucun professionnel correspondant trouvé sur Winelio : N'APPELLE PLUS d'outil, annonce-le tout de suite au membre et propose d'essayer une ville voisine ou une autre catégorie.",
            };
          }
        }
      } else if (fnName === "find_existing_contacts") {
        const q = fold(typeof args.name === "string" ? args.name : "");
        if (q.length < 2) {
          toolResult = { matches: [] };
        } else {
          const { data: contacts } = await db
            .from("contacts")
            .select("id,first_name,last_name,email,phone")
            .eq("user_id", user.id);

          const tokens = q.split(/\s+/).filter(Boolean);
          const matches = (contacts ?? []).filter((c: Contact) => {
            if (accountEmail && (c.email ?? "").trim().toLowerCase() === accountEmail) return false;
            const full = fold(`${c.first_name} ${c.last_name}`);
            return tokens.every((t) => full.includes(t));
          });

          if (matches.length > 0) {
            surfacedContacts = matches.slice(0, 5);
          } else if (typeof args.name === "string" && args.name.trim().length >= 2) {
            deviceContactSearchQuery = args.name.trim();
          }

          // Minimisation RGPD : on ne renvoie pas l'email/téléphone des autres contacts au LLM
          toolResult = {
            matches: matches.slice(0, 5).map((c: Contact) => ({
              id: c.id,
              first_name: c.first_name,
              last_name: c.last_name,
            })),
            ...(matches.length === 0
              ? {
                  hint: "Aucun contact existant : appelle update_draft pour pré-remplir prénom, nom, ville et besoin déjà mentionnés.",
                }
              : {}),
          };
        }
      } else if (fnName === "update_draft") {
        const warnings: string[] = [];

        if (typeof args.selected_pro_id === "string") {
          const proId = args.selected_pro_id.trim();
          if (!proId || /^(null|none|aucun|clear)$/i.test(proId)) {
            patch.selectedProId = null;
            patch.selectedPro = null;
          } else if (proId === user.id) {
            warnings.push("Interdit : le membre ne peut pas se recommander lui-même.");
          } else if (surfacedPros !== undefined && !preSelectedPro) {
            // Interdit d'auto-sélectionner un pro dans le même tour qu'une recherche : le membre doit voir la liste et choisir lui-même
            patch.selectedProId = null;
            patch.selectedPro = null;
            warnings.push(
              "Ne sélectionne pas de professionnel toi-même après une recherche : invite simplement le membre à choisir dans la liste.",
            );
          } else if (UUID_RE.test(proId) || lastSearchedPros.has(proId)) {
            patch.selectedProId = proId;
            if (lastSearchedPros.has(proId)) {
              patch.selectedPro = lastSearchedPros.get(proId)!;
            }
          }
        }

        if (
          typeof args.description === "string" &&
          args.description.trim() &&
          !isGenericPlaceholderDescription(args.description)
        ) {
          patch.description = args.description.trim();
        }

        if (args.urgency === "urgent" || args.urgency === "normal" || args.urgency === "flexible") {
          patch.urgency = args.urgency;
        }

        if (
          typeof args.selected_contact_id === "string" &&
          UUID_RE.test(args.selected_contact_id.trim())
        ) {
          patch.selectedContactId = args.selected_contact_id.trim();
          patch.createContact = false;
        } else {
          const cf: Partial<ContactFormData> = { ...(patch.contactForm ?? {}) };
          let touchedContact = false;

          if (typeof args.first_name === "string" && args.first_name.trim()) {
            cf.first_name = args.first_name.trim();
            touchedContact = true;
          }
          if (typeof args.last_name === "string" && args.last_name.trim()) {
            cf.last_name = args.last_name.trim();
            touchedContact = true;
          }
          if (cf.first_name || cf.last_name) {
            justCapturedSpokenName = [
              cf.first_name ?? draft?.contactForm?.first_name,
              cf.last_name ?? draft?.contactForm?.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim();
          }
          if (
            !deviceContactSearchQuery &&
            (cf.first_name || cf.last_name) &&
            !(cf.phone || draft?.contactForm?.phone) &&
            !(cf.email || draft?.contactForm?.email)
          ) {
            deviceContactSearchQuery = [
              cf.first_name ?? draft?.contactForm?.first_name,
              cf.last_name ?? draft?.contactForm?.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim();
          }
          if (typeof args.email === "string" && args.email.trim()) {
            const auditedEmail = auditSpokenEmail(args.email);
            const rawSpokenMismatch = auditedEmail.ok
              ? detectRawSpokenDomainMismatch(latestUserMessage, auditedEmail.email)
              : null;
            if (!auditedEmail.ok) {
              warnings.push(auditedEmail.reason);
              rejectedEmailFallback = {
                suggested: auditedEmail.suggestedEmail,
                message: auditedEmail.suggestedEmail
                  ? `J'ai entendu « ${auditedEmail.cleaned} » : vouliez-vous plutôt dire ${auditedEmail.suggestedEmail} ? Vous pouvez me le confirmer ou l'épeler.`
                  : `Je n'ai pas bien saisi l'adresse e-mail (« ${auditedEmail.cleaned || args.email.trim()} »). Pouvez-vous me l'épeler lettre par lettre ou l'écrire au clavier ?`,
              };
            } else if (rawSpokenMismatch) {
              warnings.push(rawSpokenMismatch.reason);
              rejectedEmailFallback = {
                suggested: rawSpokenMismatch.suggestedEmail,
                message: `J'ai entendu « ${rawSpokenMismatch.spokenEmail} » : vouliez-vous plutôt dire ${rawSpokenMismatch.suggestedEmail} ? Vous pouvez me le confirmer ou l'épeler.`,
              };
            } else if (accountEmail && auditedEmail.email === accountEmail) {
              warnings.push(
                "Interdit : l'adresse e-mail donnée est celle du membre connecté. Le recommandé doit être une autre personne.",
              );
              rejectedEmailFallback = {
                message:
                  "Cette adresse e-mail est celle de votre propre compte Winelio : merci d'indiquer l'adresse e-mail personnelle de votre proche.",
              };
            } else {
              cf.email = auditedEmail.email;
              justCapturedSpokenEmail = auditedEmail.email;
              touchedContact = true;
            }
          }
          if (typeof args.phone === "string" && args.phone.trim()) {
            cf.phone = cleanSpokenPhone(args.phone);
            touchedContact = true;
          }
          if (typeof args.address === "string" && args.address.trim()) {
            cf.address = args.address.trim();
            touchedContact = true;
          }
          if (typeof args.city === "string" && args.city.trim()) {
            cf.city = args.city.trim();
            touchedContact = true;
          }
          if (typeof args.postal_code === "string" && args.postal_code.trim()) {
            cf.postal_code = args.postal_code.replace(/\s+/g, "").trim();
            touchedContact = true;
          }

          // Auto-complétion ville <-> code postal si un seul des deux vient d'être fourni
          const effectiveCity = cf.city ?? draft?.contactForm?.city ?? "";
          const effectiveZip = cf.postal_code ?? draft?.contactForm?.postal_code ?? "";
          if (effectiveCity && !effectiveZip) {
            const geo = await geocodeCommune(effectiveCity);
            if (geo?.postalCode) cf.postal_code = geo.postalCode;
          } else if (effectiveZip && !effectiveCity) {
            const geo = await geocodeCommune(effectiveZip);
            if (geo?.nom) cf.city = geo.nom;
          }

          if (touchedContact) {
            patch.contactForm = cf;
            patch.createContact = true;
            patch.selectedContactId = null;
          }
        }

        const nextStatus = computeMissingState(draft, patch, surfacedPros?.length ?? 0);
        const needInitialProSearch =
          nextStatus.stage === "search_pro" &&
          surfacedPros === undefined &&
          (draft?.recentProfessionals?.length ?? 0) === 0;
        toolResult = {
          ok: warnings.length === 0,
          applied: Object.keys(patch),
          warnings,
          ready_to_submit: nextStatus.missingFields.length === 0,
          etape_suivante: nextStatus.stage,
          consigne_suite:
            warnings.length > 0
              ? `ATTENTION : signale clairement cet avertissement au membre en 1-2 phrases courtes et demande-lui de confirmer ou corriger : ${warnings.join(" ")}`
              : surfacedPros !== undefined && surfacedPros.length === 0
                ? "Aucun professionnel n'a été trouvé lors de la recherche : annonce-le clairement et propose d'essayer une ville voisine ou une autre catégorie (ne demande PAS le type d'intervention)."
                : needInitialProSearch
                  ? `Aucun professionnel n'a encore été cherché : si le membre a mentionné un métier et une ville (ou code postal / gps=true), appelle IMMÉDIATEMENT search_professionals maintenant ! Sinon seulement, pose : "${nextStatus.suggestedQuestion}"`
                  : nextStatus.missingFields.length > 0
                    ? `Pose UNIQUEMENT cette prochaine question courte (ne demande RIEN d'autre en avance, et ne parle pas encore du consentement RGPD) : "${nextStatus.suggestedQuestion}"`
                    : "COMPLET : tous les champs sont remplis, invite le membre à cocher le consentement RGPD et cliquer sur Envoyer la recommandation.",
        };
      }

      apiMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    // Réponse directe après exécution des outils si aucune relance d'outil ni réponse libre n'est requise (divise la latence et les tokens par 2)
    if (!isConversationalOrMeta) {
      if (rejectedEmailFallback) {
        return NextResponse.json(
          {
            reply: rejectedEmailFallback.message,
            professionals: surfacedPros,
            matchedContacts: surfacedContacts,
            deviceContactSearchQuery,
            patch: Object.keys(patch).length > 0 ? patch : undefined,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      if (surfacedPros !== undefined) {
        const afterSearchStatus = computeMissingState(draft, patch, surfacedPros.length);
        let searchReply: string;
        if (surfacedPros.length === 0) {
          searchReply =
            "Je n'ai trouvé aucun professionnel correspondant dans ce secteur sur Winelio. Souhaitez-vous chercher autour d'une ville voisine ou dans une autre catégorie ?";
        } else if (surfacedPros.length === 1) {
          const onlyName =
            surfacedPros[0].company_name ??
            `${surfacedPros[0].first_name ?? ""} ${surfacedPros[0].last_name ?? ""}`.trim();
          searchReply = `J'ai trouvé 1 professionnel correspondant (${onlyName}). Souhaitez-vous le choisir ?`;
        } else {
          searchReply = afterSearchStatus.suggestedQuestion;
        }
        return NextResponse.json(
          {
            reply: searchReply,
            professionals: surfacedPros,
            matchedContacts: surfacedContacts,
            deviceContactSearchQuery,
            patch: Object.keys(patch).length > 0 ? patch : undefined,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const postToolStatus = computeMissingState(draft, patch, 0);
      if (
        Object.keys(patch).length > 0 &&
        postToolStatus.stage !== "search_pro" &&
        !surfacedContacts?.length
      ) {
        let directReply = postToolStatus.suggestedQuestion;
        if (justCapturedSpokenEmail && !directReply.toLowerCase().includes(justCapturedSpokenEmail)) {
          directReply = `J'ai bien noté l'e-mail ${justCapturedSpokenEmail}${
            justCapturedSpokenName ? ` pour ${justCapturedSpokenName}` : ""
          } (vérifiez bien son orthographe sur la fiche). ${directReply}`;
        }
        return NextResponse.json(
          {
            reply: directReply,
            matchedContacts: surfacedContacts,
            deviceContactSearchQuery,
            patch,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }
  }

  const endStatus = computeMissingState(draft, patch, surfacedPros?.length ?? 0);
  const fallbackReply =
    surfacedPros !== undefined && surfacedPros.length === 0
      ? "Je n'ai trouvé aucun professionnel correspondant dans ce secteur sur Winelio. Souhaitez-vous chercher autour d'une ville voisine ou dans une autre catégorie ?"
      : endStatus.suggestedQuestion;
  return NextResponse.json(
    {
      reply: fallbackReply,
      professionals: surfacedPros,
      matchedContacts: surfacedContacts,
      patch: Object.keys(patch).length > 0 ? patch : undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
