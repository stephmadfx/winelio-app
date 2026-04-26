import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");
const trackClick = (rid: string) => `${SITE_URL}/api/email-track/click?rid=${encodeURIComponent(rid)}`;

export async function notifyScrapedReminder(recommendationId: string) {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, project_description, urgency_level,
       professional:profiles!recommendations_professional_id_fkey(companies(name, email, source)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const pro = normalize<{ companies: unknown }>(rec.professional);
  const company = normalize<{ name: string | null; email: string | null; source: string | null }>(pro?.companies);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  // Uniquement pour les pros scrappés
  if (company?.source !== "scraped") return;

  const isPlaceholder = (e: string | null) => !!e && /@kiparlo-pro\.fr$/i.test(e);
  const recipientEmail = company?.email && !isPlaceholder(company.email) ? company.email : null;
  if (!recipientEmail) return;

  const ctaUrl = trackClick(recommendationId);
  const companyName = company?.name || "votre entreprise";
  const referrerName = [referrer?.first_name, referrer?.last_name].filter(Boolean).join(" ") || "Un membre Winelio";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "un client";

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rappel — Un client vous recommande</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🔔</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Rappel — Un client vous attend</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Nous vous avons contacté hier au sujet d'un lead qualifié. <strong style="color:#2D3436;">${he(referrerName)}</strong> a recommandé votre entreprise <strong style="color:#2D3436;">${he(companyName)}</strong> à <strong style="color:#2D3436;">${he(contactName)}</strong> via Winelio.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Ce lead est toujours disponible. Pour le récupérer et contacter ${he(contactName)}, revendiquez votre fiche Winelio gratuitement en quelques minutes.</p>
          </td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Récupérer mon lead →</a></td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;line-height:1.5;">Ce rappel est envoyé une seule fois. Si vous n'êtes pas intéressé, ignorez cet email.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await queueEmail({
    to: recipientEmail,
    subject: `Rappel : ${he(referrerName)} a recommandé ${he(companyName)} à un client`,
    html,
  });
}
