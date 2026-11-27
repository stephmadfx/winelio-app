import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAiAssistantAllowed } from "@/lib/ai-assistant-access";
import { fakeLastActive } from "@/lib/fake-last-active";
import {
  EMAIL_REGEX,
  type Contact,
  type ContactFormData,
  type Professional,
  type Urgency,
} from "@/app/(protected)/recommendations/new/types";

const MISTRAL_MODEL = "mistral-small-latest";
const GROQ_FALLBACK_MODELS: { id: string; lowReasoning?: boolean }[] = [
  { id: "openai/gpt-oss-20b", lowReasoning: true },
  { id: "openai/gpt-oss-120b", lowReasoning: true },
  { id: "qwen/qwen3.8-27b" },
];

let mistralChatBillingInactive = false;

async function callLlmWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiMessages: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
  round: number,
  mistralKey?: string,
  groqKey?: string,
) {
  if (mistralKey && !mistralChatBillingInactive) {
    const mistralToolChoice = round === 0 ? "any" : round >= 4 ? "none" : "auto";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: apiMessages,
        tools,
        tool_choice: mistralToolChoice,
        temperature: 0.2,
        max_tokens: 400,
      }),
    }).catch(() => null);

    if (res && res.ok) {
      return res;
    }
    if (res?.status === 402) {
      mistralChatBillingInactive = true;
    }
  }

  if (groqKey) {
    const groqToolChoice = round === 0 ? "required" : round >= 4 ? "none" : "auto";
    let lastRes: Response | null = null;
    for (const m of GROQ_FALLBACK_MODELS) {
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
          tools,
          tool_choice: groqToolChoice,
          temperature: 0.2,
          max_completion_tokens: 260,
        }),
      }).catch(() => null);

      if (res && res.ok) return res;
      lastRes = res;
    }
    return lastRes;
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

const COMMON_EMAIL_PROVIDERS =
  "(gmail\\.com|orange\\.fr|wanadoo\\.fr|outlook\\.fr|outlook\\.com|hotmail\\.fr|hotmail\\.com|yahoo\\.fr|yahoo\\.com|free\\.fr|sfr\\.fr|laposte\\.net|icloud\\.com|bbox\\.fr|live\\.fr)";

function cleanSpokenEmail(raw: string): string {
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
    if (m) {
      cleaned = `${m[1]}@${m[2]}`;
    }
  }
  return cleaned;
}

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

function computeMissingState(draft: DraftInput | undefined, patch: DraftPatch) {
  const proId = patch.selectedProId !== undefined ? patch.selectedProId : draft?.selectedProId;
  const desc = (patch.description ?? draft?.description ?? "").trim();
  const contactId =
    patch.selectedContactId !== undefined ? patch.selectedContactId : draft?.selectedContactId;
  const cf: Partial<ContactFormData> = {
    ...(draft?.contactForm ?? {}),
    ...(patch.contactForm ?? {}),
  };

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
  let suggestedQuestion = "Tout est complet ! Il ne vous reste plus qu'à cocher la case de consentement RGPD et cliquer sur « Envoyer la recommandation ».";

  if (!proId) {
    suggestedQuestion =
      "Quel type de professionnel recherchez-vous et autour de quelle ville ?";
  } else if (!desc) {
    suggestedQuestion =
      "Pouvez-vous me décrire en quelques mots le besoin pour que le professionnel prépare son appel ?";
  } else if (!contactId) {
    if (!cf.first_name?.trim() || !cf.last_name?.trim()) {
      suggestedQuestion =
        "Quel est le prénom et le nom de la personne que vous souhaitez recommander ?";
    } else if (!cf.phone?.trim() && !cf.email?.trim()) {
      suggestedQuestion = `C'est noté pour ${personLabel} ! Quels sont son numéro de téléphone et son adresse e-mail ?`;
    } else if (!cf.email?.trim()) {
      suggestedQuestion = `Merci ! Quelle est l'adresse e-mail de ${personLabel} ?`;
    } else if (!cf.phone?.trim()) {
      suggestedQuestion = `Merci ! Quel est le numéro de téléphone de ${personLabel} ?`;
    } else if (!cf.address?.trim() || !cf.city?.trim() || !cf.postal_code?.trim()) {
      const missingAddrParts = [
        !cf.address?.trim() ? "numéro et rue" : null,
        !cf.city?.trim() ? "ville" : null,
        !cf.postal_code?.trim() ? "code postal" : null,
      ].filter(Boolean);
      suggestedQuestion = `Presque terminé ! Quelle est l'adresse postale de ${personLabel} (${missingAddrParts.join(", ")}) ?`;
    }
  }

  return { missingFields, suggestedQuestion };
}

function cleanSpokenPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^0[1-9]\d{8}$/.test(digits)) {
    return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return raw.trim();
}

const TRADE_SYNONYMS: Record<string, string> = {
  plombier: "plomberie",
  sanitaire: "plomberie",
  chauffe: "chauffage",
  chauffagiste: "chauffage",
  pac: "chauffage",
  clim: "climatisation",
  electricien: "electricite",
  immo: "immobilier",
  agence: "immobilier",
  maison: "immobilier",
  appartement: "immobilier",
  dj: "evenementiel",
  degie: "evenementiel",
  mariage: "evenementiel",
  soiree: "evenementiel",
  animateur: "evenementiel",
  animation: "evenementiel",
  sono: "evenementiel",
  toit: "couverture",
  toiture: "couverture",
  couvreur: "couverture",
  serrurier: "serrurerie",
  peintre: "peinture",
  menuisier: "menuiserie",
  fenetre: "menuiserie",
  macon: "maconnerie",
  jardin: "jardinage",
  paysagiste: "espaces verts",
};

function resolveCategoryName(input: string | undefined, categoryNames: string[]): string {
  if (!input || fold(input) === "all" || fold(input) === "toutes") return "all";
  const target = fold(input);

  const exact = categoryNames.find((c) => fold(c) === target);
  if (exact) return exact;

  const partial = categoryNames.find(
    (c) => fold(c).includes(target) || target.includes(fold(c)),
  );
  if (partial) return partial;

  for (const [syn, canonical] of Object.entries(TRADE_SYNONYMS)) {
    if (target.includes(syn)) {
      const mapped = categoryNames.find((c) => fold(c).includes(canonical));
      if (mapped) return mapped;
    }
  }
  return "all";
}

async function geocodeCommune(
  query: string,
): Promise<{ lat: number; lng: number; nom: string; postalCode: string | null } | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  const isPostal = /^\d{5}$/.test(trimmed);
  const params = new URLSearchParams({
    fields: "nom,codesPostaux,centre",
    boost: "population",
    limit: "5",
  });
  if (isPostal) params.set("codePostal", trimmed);
  else params.set("nom", trimmed);

  const res = await fetch(`https://geo.api.gouv.fr/communes?${params.toString()}`, {
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (res && res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { nom: string; codesPostaux?: string[]; centre?: { coordinates?: [number, number] } }[]
      | null;
    const hit = data?.find((c) => c.centre?.coordinates?.length === 2);
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

  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!mistralKey && !groqKey) {
    return NextResponse.json(
      { error: "Assistant IA non configuré côté serveur (MISTRAL_API_KEY / GROQ_API_KEY)." },
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
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  if (incomingMessages.length === 0) {
    return NextResponse.json({ error: "Aucun message fourni." }, { status: 400 });
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

  const initialStatus = computeMissingState(draft, patch);

  const draftSummary = draft
    ? JSON.stringify({
        pro_choisi: draft.selectedProId
          ? `${draft.selectedProLabel || "Sélectionné"} (${draft.selectedProId})`
          : null,
        pros_proposes_recemment: (draft.recentProfessionals ?? []).slice(0, 6),
        besoin: draft.description || null,
        urgence: draft.urgency,
        contact_existant: draft.selectedContactId
          ? `${draft.selectedContactLabel || "Sélectionné"} (${draft.selectedContactId})`
          : null,
        nouveau_contact: draft.contactForm,
        champs_obligatoires_manquants: initialStatus.missingFields,
        gps: Boolean(body?.userLocation),
      })
    : "{}";

  const systemPrompt = `Assistant Winelio. Aide ${memberFirstName || "le membre"} à préparer une recommandation pour un TIERS (c'est la personne recommandée que le professionnel recontactera, jamais le membre lui-même : ne dis jamais "vous recontacter", dis "recontacter votre proche").
RÈGLE ABSOLUE DE MISE EN RELATION CACHÉE : Ne donne ni n'invente JAMAIS les coordonnées d'un professionnel (téléphone, e-mail, adresse postale exacte, site web) et ne suggère JAMAIS de chercher ou contacter le pro en direct hors Winelio (ni Google, ni Pages Jaunes, ni appel direct). Si on te les demande, explique que toute mise en relation passe exclusivement par l'envoi de la recommandation sur Winelio pour que le pro recontacte le proche et que la commission du membre soit protégée.
Éléments requis TOUS OBLIGATOIRES avant la fin :
1) Professionnel Winelio : utilise search_professionals dès que tu connais le métier/besoin + une ville/code postal (ou gps=true). Si le membre choisit un pro parmi pros_proposes_recemment ("le premier", numéro ou nom), passe son id exact dans update_draft.selected_pro_id.
2) Besoin + urgence ("urgent", "normal", "flexible").
3) Recommandé : cherche d'abord avec find_existing_contacts si un nom est cité ; s'il n'existe pas dans le carnet, il faut OBLIGATOIREMENT demander et remplir TOUS ces 7 champs via update_draft : prénom, nom, téléphone, e-mail, numéro et rue (address), ville et code postal.
INTERDICTION ABSOLUE d'inviter à cocher le consentement RGPD ou de cliquer sur "Envoyer la recommandation" tant que champs_encore_manquants n'est pas vide ([]). Regroupe naturellement les questions (ex: téléphone + e-mail ensemble, puis adresse complète rue + ville).
Appelle TOUJOURS update_draft dès qu'une info est donnée, même partielle. Si le membre cite dans une même phrase un besoin/métier ET le nom de son proche, appelle à la fois search_professionals, find_existing_contacts et update_draft avant ta réponse finale pour ne jamais redemander ce qu'il vient de dire.
STYLE VOCAL FLUIDE ET RAPIDE : réponds en 1 ou 2 phrases naturelles et chaleureuses (20 à 30 mots maximum). Quand des fiches pros s'affichent sous ton message, ne récite pas toute la liste : dis simplement combien tu en as trouvé et invite à en choisir un.
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
              description: "Nom de la catégorie officielle Winelio (ex: 'Plomberie', 'Immobilier', 'Événementiel') ou 'all'.",
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiMessages: any[] = [{ role: "system", content: systemPrompt }, ...incomingMessages];

  for (let round = 0; round < 5; round++) {
    const res = await callLlmWithFallback(apiMessages, tools, round, mistralKey, groqKey);

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
      const currentStatus = computeMissingState(draft, patch);
      if (currentStatus.missingFields.length > 0 && PREMATURE_COMPLETION_RE.test(reply)) {
        reply = currentStatus.suggestedQuestion;
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
              "Ville introuvable ou manquante. Demande la ville ou le code postal au membre pour lancer la recherche.",
          };
        } else {
          const resolvedCategory = resolveCategoryName(catStr, categoryNames);
          const { data: rows, error } = await db.rpc("search_professionals_by_distance", {
            p_latitude: coords.lat,
            p_longitude: coords.lng,
            p_category_name: resolvedCategory,
            p_commune: coords.nom,
            p_search: nameStr,
            p_limit: 12,
          });

          if (error) {
            toolResult = { found: 0, error: "Erreur technique lors de la recherche." };
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const filtered = (rows ?? []).filter((r: any) => r.profile_id !== user.id).slice(0, 6);
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

        if (typeof args.selected_pro_id === "string" && args.selected_pro_id.trim()) {
          const proId = args.selected_pro_id.trim();
          if (proId === user.id) {
            warnings.push("Interdit : le membre ne peut pas se recommander lui-même.");
          } else {
            patch.selectedProId = proId;
            if (lastSearchedPros.has(proId)) {
              patch.selectedPro = lastSearchedPros.get(proId)!;
            }
          }
        }

        if (typeof args.description === "string" && args.description.trim()) {
          patch.description = args.description.trim();
        }

        if (args.urgency === "urgent" || args.urgency === "normal" || args.urgency === "flexible") {
          patch.urgency = args.urgency;
        }

        if (typeof args.selected_contact_id === "string" && args.selected_contact_id.trim()) {
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
            const cleanedEmail = cleanSpokenEmail(args.email);
            if (accountEmail && cleanedEmail === accountEmail) {
              warnings.push(
                "Interdit : l'adresse e-mail donnée est celle du membre connecté. Le recommandé doit être une autre personne.",
              );
            } else if (!EMAIL_REGEX.test(cleanedEmail)) {
              warnings.push(
                `Format d'e-mail incomplet ("${cleanedEmail}") : demande au membre de confirmer l'adresse e-mail exacte avec le domaine.`,
              );
            } else {
              cf.email = cleanedEmail;
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

        const nextStatus = computeMissingState(draft, patch);
        toolResult = {
          ok: warnings.length === 0,
          applied: Object.keys(patch),
          warnings,
          ready_to_submit: nextStatus.missingFields.length === 0,
          champs_encore_manquants: nextStatus.missingFields,
          consigne_suite:
            nextStatus.missingFields.length > 0
              ? `INCOMPLET : il manque encore [${nextStatus.missingFields.join(", ")}]. INTERDIT de parler du consentement RGPD ou du bouton Envoyer ! Demande maintenant : "${nextStatus.suggestedQuestion}"`
              : "COMPLET : tous les champs sont remplis, invite le membre à cocher le consentement RGPD et cliquer sur Envoyer la recommandation.",
        };
      }

      apiMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  const endStatus = computeMissingState(draft, patch);
  return NextResponse.json(
    {
      reply: endStatus.suggestedQuestion,
      professionals: surfacedPros,
      matchedContacts: surfacedContacts,
      patch: Object.keys(patch).length > 0 ? patch : undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
