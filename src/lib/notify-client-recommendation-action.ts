import { queueEmail } from "@/lib/email-queue";
import { he } from "@/lib/html-escape";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  signClientRecommendationToken,
  type ClientActionPurpose,
} from "@/lib/client-recommendation-token";
import { formatDisplayName } from "@/lib/utils";
import { pickActiveCompany } from "@/lib/pick-active-company";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(
  /\/$/,
  "",
);
const ACTION_TTL_DAYS = 30;
const LOGO_URL =
  "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";

type ActionPreparation = {
  token_version: number;
  token_expires_at: string;
};

type RecommendationParty = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  companies?: unknown;
};

function normalize<T>(value: unknown): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value as T | null);
}

function emailShell(params: {
  title: string;
  greeting: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accent?: string;
}): string {
  const cta =
    params.ctaLabel && params.ctaUrl
      ? `<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
         <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;"><a href="${he(params.ctaUrl)}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;">${he(params.ctaLabel)} →</a></td></tr></table></td></tr>`
      : "";
  const accent = params.accent
    ? `<tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:14px 18px;border-radius:4px;color:#636E72;font-size:13px;line-height:1.6;">${params.accent}</td></tr>`
    : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${he(params.title)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;"><img src="${LOGO_URL}" alt="Winelio" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;"></td></tr>
<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">${he(params.title)}</h1></td></tr>
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${params.greeting}</p></td></tr>
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${params.body}</p></td></tr>
${accent}${cta}
</table></td></tr>
<tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
</table></td></tr></table></body></html>`;
}

export async function requestClientRecommendationAction(
  recommendationId: string,
  purpose: ClientActionPurpose,
): Promise<{ queued: boolean; tokenVersion: number }> {
  const expiresAt = new Date(
    Date.now() + ACTION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const { data: preparedRaw, error: prepareError } = await supabaseAdmin
    .schema("winelio")
    .rpc("prepare_client_recommendation_action", {
      p_recommendation_id: recommendationId,
      p_purpose: purpose,
      p_expires_at: expiresAt.toISOString(),
    });
  if (prepareError) throw prepareError;

  const prepared = (Array.isArray(preparedRaw)
    ? preparedRaw[0]
    : preparedRaw) as ActionPreparation | null;
  if (!prepared?.token_version || !prepared.token_expires_at) {
    throw new Error("Préparation de la validation client incomplète");
  }

  const { data: rec, error: recError } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, amount, expected_completion_at,
       contact:contacts(first_name, last_name, email),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, companies(name, deleted_at))`,
    )
    .eq("id", recommendationId)
    .single();
  if (recError || !rec) throw recError ?? new Error("Recommandation introuvable");

  const contact = normalize<RecommendationParty>(rec.contact);
  const referrer = normalize<RecommendationParty>(rec.referrer);
  const professional = normalize<RecommendationParty>(rec.professional);
  if (!contact?.email) {
    throw new Error("Le client final n'a pas d'adresse email");
  }

  const company = pickActiveCompany<{
    name: string | null;
    deleted_at: string | null;
  }>(professional?.companies);
  const contactFirst = contact.first_name || "Bonjour";
  const proName =
    company?.name ||
    formatDisplayName(
      professional?.first_name,
      professional?.last_name,
      "Le professionnel",
    );
  const referrerName = formatDisplayName(
    referrer?.first_name,
    referrer?.last_name,
    "Votre contact",
  );
  const token = signClientRecommendationToken({
    recommendationId,
    purpose,
    tokenVersion: prepared.token_version,
    expiresAt: prepared.token_expires_at,
  });
  const actionUrl = `${SITE_URL}/recommendations/client/${encodeURIComponent(token)}`;

  const isQuote = purpose === "quote";
  const title = isQuote
    ? "Confirmez-vous ce devis ?"
    : "La prestation est-elle terminée ?";
  const body = isQuote
    ? `<strong style="color:#2D3436;">${he(proName)}</strong> indique vous avoir présenté un devis de <strong style="color:#FF6B35;">${Number(rec.amount ?? 0).toLocaleString("fr-FR")} €</strong>. Merci de confirmer directement votre décision.`
    : `<strong style="color:#2D3436;">${he(proName)}</strong> indique que la prestation est terminée et que votre paiement a été reçu. Merci de confirmer que tout est conforme.`;
  const accent = isQuote
    ? `Cette confirmation concerne uniquement l'acceptation du devis. Aucun paiement ne sera demandé par Winelio.`
    : `En cas de problème, vous pourrez le signaler avant la clôture de l'affaire.`;
  const html = emailShell({
    title,
    greeting: `Bonjour <strong style="color:#2D3436;">${he(contactFirst)}</strong>,`,
    body,
    ctaLabel: isQuote ? "Répondre au devis" : "Confirmer la prestation",
    ctaUrl: actionUrl,
    accent: `${accent}<br>Cette mise en relation vous a été transmise par ${he(referrerName)}.`,
  });

  const queued = await queueEmail({
    to: contact.email,
    toName:
      formatDisplayName(contact.first_name, contact.last_name, "") || undefined,
    subject: title,
    html,
    text: `${title}\n\n${actionUrl}`,
    priority: 2,
    dedupeKey: `client-action:${recommendationId}:${purpose}:v${prepared.token_version}`,
    throwOnError: true,
  });

  return { queued: queued.inserted, tokenVersion: prepared.token_version };
}

export async function notifyClientRecommendationDecision(params: {
  recommendationId: string;
  purpose: ClientActionPurpose;
  decision: "confirm" | "dispute";
  note?: string | null;
  tokenVersion: number;
}): Promise<void> {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `contact:contacts(first_name, last_name),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name, email),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, email, companies(name, deleted_at))`,
    )
    .eq("id", params.recommendationId)
    .single();
  if (!rec) return;

  const contact = normalize<RecommendationParty>(rec.contact);
  const referrer = normalize<RecommendationParty>(rec.referrer);
  const professional = normalize<RecommendationParty>(rec.professional);
  const clientName = formatDisplayName(
    contact?.first_name,
    contact?.last_name,
    "Le client",
  );
  const isDispute = params.decision === "dispute";
  const title = isDispute
    ? params.purpose === "quote"
      ? `${clientName} signale que le devis n'est pas accepté`
      : `${clientName} signale un problème sur la prestation`
    : params.purpose === "quote"
      ? `${clientName} a accepté le devis`
      : `${clientName} a confirmé la prestation`;
  const body = isDispute
    ? `Une intervention est nécessaire avant de poursuivre cette recommandation.${params.note ? `<br><br><strong style="color:#2D3436;">Message du client :</strong><br>${he(params.note)}` : ""}`
    : params.purpose === "quote"
      ? `Le professionnel peut désormais poursuivre la prestation.`
      : `L'affaire est confirmée. La commission d'intermédiation peut maintenant être réglée par le professionnel.`;
  const html = emailShell({
    title,
    greeting: `Mise à jour de la recommandation pour <strong style="color:#2D3436;">${he(clientName)}</strong>.`,
    body,
    ctaLabel: "Ouvrir la recommandation",
    ctaUrl: `${SITE_URL}/recommendations/${params.recommendationId}`,
  });

  const recipients = [
    { key: "professional", party: professional },
    { key: "referrer", party: referrer },
  ];
  await Promise.all(
    recipients.map(async ({ key, party }) => {
      if (!party?.email) return;
      await queueEmail({
        to: party.email,
        toName:
          formatDisplayName(party.first_name, party.last_name, "") || undefined,
        subject: title,
        html,
        priority: isDispute ? 1 : 3,
        dedupeKey: `client-decision:${params.recommendationId}:${params.purpose}:v${params.tokenVersion}:${key}`,
      });
    }),
  );
}
