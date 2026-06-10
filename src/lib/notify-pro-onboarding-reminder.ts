import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

/**
 * Relance un pro qui a créé sa fiche entreprise mais n'a jamais terminé son
 * inscription professionnelle (engagement non signé → is_professional=false
 * → invisible dans la recherche de pros). Envoyée UNE SEULE FOIS par user
 * (dedupeKey email_queue). Cf. cas DHSERVICES 2026-06-10.
 */
export async function notifyProOnboardingReminder(params: {
  userId: string;
  firstName: string | null;
  companyName: string | null;
}): Promise<boolean> {
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(params.userId);
  const email = authUser?.user?.email;
  if (!email) return false;

  const firstName = params.firstName || "Bonjour";
  const companyName = params.companyName || "votre entreprise";
  const onboardingUrl = `${SITE_URL}/profile/pro-onboarding`;
  const subject = "Plus qu'une étape pour recevoir vos premiers clients";

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${he(subject)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🚀</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Votre fiche est prête — activez-la !</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(firstName)}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">La fiche de <strong style="color:#2D3436;">${he(companyName)}</strong> est créée et vérifiée. Mais votre inscription professionnelle n'est pas terminée : tant que vous n'avez pas accepté l'engagement Winelio, <strong style="color:#2D3436;">vous n'apparaissez pas dans la recherche</strong> et ne pouvez pas recevoir de recommandations.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;"><p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Il ne reste qu'<strong style="color:#2D3436;">une seule étape de 30 secondes</strong> : lire et accepter l'engagement professionnel. Aucune carte bancaire n'est demandée à cette étape.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${onboardingUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Terminer mon inscription →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const queueId = await queueEmail({
    to: email,
    toName: params.firstName || undefined,
    subject,
    html,
    text: `Bonjour ${firstName},\n\nLa fiche de ${companyName} est créée et vérifiée, mais votre inscription professionnelle n'est pas terminée. Tant que l'engagement Winelio n'est pas accepté, vous n'apparaissez pas dans la recherche et ne pouvez pas recevoir de recommandations.\n\nTerminer mon inscription (30 secondes) : ${onboardingUrl}\n\n© 2026 Winelio`,
    dedupeKey: `pro-onboarding-reminder:${params.userId}`,
  });

  return queueId !== null;
}
