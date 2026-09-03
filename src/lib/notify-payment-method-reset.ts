import { queueEmail } from "@/lib/email-queue";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { he } from "@/lib/html-escape";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

export function buildPaymentMethodResetEmail(firstName: string): string {
  const safeFirstName = he(firstName || "Professionnel");
  const profileUrl = `${APP_URL.replace(/\/$/, "")}/profile`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:24px;">&nbsp;</td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:25px;line-height:52px;">💳</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Veuillez réenregistrer votre carte</h1></td></tr>
          <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="color:#636E72;font-size:15px;line-height:1.6;margin:0;">Bonjour <strong style="color:#2D3436;">${safeFirstName}</strong>,</p></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="color:#636E72;font-size:14px;line-height:1.65;margin:0;">La recommandation de test concernant Sacha Carlier a été annulée. Aucun paiement n'a été prélevé et aucune commission n'a été distribuée.</p></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;"><p style="color:#2D3436;font-size:14px;font-weight:700;line-height:1.55;margin:0;">Votre ancienne carte enregistrée a été retirée afin que vous puissiez tester le nouveau parcours et donner votre autorisation explicite.</p><p style="color:#636E72;font-size:13px;line-height:1.55;margin:8px 0 0;">La commission sera de 10 % jusqu'à 25 000 € TTC, ou de 5 % sur la totalité de l'affaire au-delà. Le débit ne pourra être déclenché qu'après votre déclaration d'encaissement du client.</p></td></tr>
          <tr><td style="height:22px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;"><a href="${he(profileUrl)}" style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 30px;border-radius:12px;text-decoration:none;">Accéder à mon profil →</a></td></tr></table></td></tr>
          <tr><td style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="color:#636E72;font-size:12px;line-height:1.5;margin:0;">L'enregistrement de la carte ne déclenche aucun paiement immédiat.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;"><p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p><p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendPaymentMethodResetEmail(input: {
  email: string;
  firstName: string;
  userId: string;
}) {
  return queueEmail({
    to: input.email,
    toName: input.firstName,
    subject: "Winelio — Veuillez réenregistrer votre carte bancaire",
    html: buildPaymentMethodResetEmail(input.firstName),
    text: `Bonjour ${input.firstName},\n\nLa recommandation de test concernant Sacha Carlier a été annulée. Aucun paiement n'a été prélevé et aucune commission n'a été distribuée.\n\nVotre ancienne carte a été retirée afin que vous puissiez tester le nouveau parcours et accepter les nouvelles conditions de paiement. La commission est de 10 % jusqu'à 25 000 € TTC, ou de 5 % sur la totalité de l'affaire au-delà. Le débit ne peut être déclenché qu'après votre déclaration d'encaissement du client.\n\nRéenregistrez votre carte depuis votre profil : ${APP_URL.replace(/\/$/, "")}/profile\n\nAucun paiement n'est effectué lors de l'enregistrement de la carte.\n\n© 2026 Winelio`,
    priority: 1,
    dedupeKey: `payment-method-reset:${input.userId}:2026-09-03-v1`,
    throwOnError: true,
  });
}
