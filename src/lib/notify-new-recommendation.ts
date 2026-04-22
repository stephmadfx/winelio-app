/**
 * Envoie un email au professionnel qui reçoit une nouvelle recommandation.
 * Deux templates distincts selon que le pro est enregistré sur Winelio (owner)
 * ou simplement scrappé d'une base externe (scraped).
 *
 * Ordre de priorité pour l'adresse destinataire :
 *   1. companies.email (donnée scrapée ou saisie par le pro)
 *   2. profiles.email  (si compte utilisateur existant)
 */
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.app";

type Urgency = "urgent" | "normal" | "flexible" | string | null;

function urgencyLabel(u: Urgency): string {
  if (u === "urgent") return "Urgent";
  if (u === "flexible") return "Flexible";
  return "Normal";
}

/** Template destiné aux pros déjà inscrits sur Winelio (source='owner') */
function buildOwnerEmail(proFirstName: string, referrerName: string, contactName: string, projectDescription: string, urgency: string, recommendationId: string): string {
  const ctaUrl = `${SITE_URL}/recommendations/${recommendationId}`;
  const greeting = proFirstName ? `Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,` : "Bonjour,";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Nouvelle recommandation Winelio</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">✨</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Nouvelle recommandation&nbsp;!</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${greeting}</p></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(referrerName)}</strong> vous recommande pour un projet&nbsp;!</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${he(contactName)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Urgence</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${he(urgency)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Projet</p>
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.5;">${he(projectDescription)}</p>
          </td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;line-height:1.5;">Acceptez rapidement pour lancer la mise en relation.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Template destiné aux pros simplement scrappés (source='scraped'), qui ne connaissent pas Winelio */
function buildScrapedEmail(companyName: string, referrerName: string, contactName: string, projectDescription: string, urgency: string, recommendationId: string): string {
  const ctaUrl = `${SITE_URL}/claim?recommendation=${recommendationId}`;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Un client veut travailler avec vous</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🤝</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Un client potentiel<br/>vous recommande&nbsp;!</h1></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(referrerName)}</strong> a recommandé votre entreprise <strong style="color:#2D3436;">${he(companyName)}</strong> à un contact via <strong style="color:#FF6B35;">Winelio</strong>, la plateforme française de recommandations entre particuliers et professionnels.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Le projet</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;line-height:1.5;">${he(projectDescription)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact intéressé</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${he(contactName)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Urgence</p>
            <p style="margin:0;color:#636E72;font-size:14px;">${he(urgency)}</p>
          </td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Pour <strong>récupérer ce lead</strong> et contacter le client, il vous suffit de revendiquer votre fiche sur Winelio — c'est <strong>gratuit</strong>, sans engagement.</p></td></tr>
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Récupérer ma fiche gratuitement →</a></td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;line-height:1.5;">En quelques minutes, accédez au contact et développez votre activité.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function notifyNewRecommendation(recommendationId: string) {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, project_description, urgency_level,
       professional:profiles!recommendations_professional_id_fkey(id, first_name, email, companies(name, email, source)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T | null));
  const pro = normalize<{
    id: string;
    first_name: string | null;
    email: string | null;
    companies: unknown;
  }>(rec.professional);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  if (!pro) return;

  const company = normalize<{ name: string | null; email: string | null; source: string | null }>(pro.companies);

  // Priorité à l'email de la company, fallback sur celui du profile.
  // On ignore les emails factices générés pour les pros scrapés (format pro.xxx@kiparlo-pro.fr).
  const isPlaceholderEmail = (e: string | null) => !!e && /@kiparlo-pro\.fr$/i.test(e);
  const candidate = company?.email && !isPlaceholderEmail(company.email) ? company.email : null;
  const fallback = pro.email && !isPlaceholderEmail(pro.email) ? pro.email : null;
  const recipientEmail = candidate || fallback;
  if (!recipientEmail) return;

  const referrerName = [referrer?.first_name, referrer?.last_name].filter(Boolean).join(" ") || "Un membre Winelio";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Un contact";
  const urgency = urgencyLabel(rec.urgency_level);
  const isScraped = company?.source === "scraped";

  const html = isScraped
    ? buildScrapedEmail(company?.name || "votre entreprise", referrerName, contactName, rec.project_description || "", urgency, recommendationId)
    : buildOwnerEmail(pro.first_name || "", referrerName, contactName, rec.project_description || "", urgency, recommendationId);

  const subject = isScraped
    ? `${referrerName} a recommandé ${company?.name || "votre entreprise"} à un client`
    : `Nouvelle recommandation de ${referrerName}`;

  await queueEmail({ to: recipientEmail, subject, html });
}
