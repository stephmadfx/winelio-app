/**
 * Deux mails d'appel à l'action programmés à la confirmation de l'inscription :
 *  - J+1 : inviter au moins 3 personnes avec son lien de parrainage
 *  - J+3 : parrainer un professionnel (bonus d'affiliation 1 %)
 * Envoyés à tous, sans condition. Doublons évités par dedupeKey.
 */
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";

const DAY_MS = 24 * 60 * 60 * 1000;

function buildCtaEmail(o: { emoji: string; title: string; body: string; highlight: string; cta: string; url: string }): string {
  const sp = `<tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
${sp}
<tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;text-align:center;vertical-align:middle;">${o.emoji}</td></tr></table></td></tr>
${sp}
<tr><td align="center" style="color:#2D3436;font-size:20px;font-weight:bold;line-height:1.4;">${o.title}</td></tr>
${sp}
<tr><td style="color:#636E72;font-size:14px;line-height:1.6;">${o.body}</td></tr>
${sp}
<tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:14px 16px;color:#2D3436;font-size:14px;line-height:1.6;">${o.highlight}</td></tr>
${sp}
<tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:12px;background:#FF6B35;background:linear-gradient(135deg,#FF6B35,#F7931E);"><a href="${o.url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;">${o.cta} &rarr;</a></td></tr></table></td></tr>
</table></td></tr>
<tr><td align="center" style="padding-top:24px;"><p style="color:#B2BAC0;font-size:11px;margin:0 0 4px;">© 2026 Winelio</p><p style="color:#FF6B35;font-size:11px;font-weight:bold;margin:0;">Recommandez, gagnez</p></td></tr>
</table></td></tr></table></body></html>`;
}

/** shiftMs : décale les deux envois (ex. -1 jour = J+1 envoyé tout de suite, pour un rattrapage). */
export async function scheduleFollowupCtaEmails(userId: string, to: string, firstName: string, sponsorCode: string, shiftMs = 0): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");
  const url = `${appUrl}/network`;
  const name = he(firstName);
  const code = he(sponsorCode);
  const now = Date.now() + shiftMs;

  await queueEmail({
    to,
    subject: `${firstName}, invitez 3 personnes dans votre réseau Winelio`,
    html: buildCtaEmail({
      emoji: "🚀",
      title: "Votre réseau commence avec 3 personnes",
      body: `Bonjour ${name},<br><br>Chaque personne que vous parrainez agrandit votre réseau (jusqu'à 5 niveaux) et vous rapporte des commissions sur ses recommandations, et sur celles de ses propres filleuls.`,
      highlight: `<strong>Objectif : 3 personnes minimum.</strong><br>Envoyez-leur votre lien de parrainage ou votre code <strong>${code}</strong>, par message, WhatsApp ou QR code.`,
      cta: "Inviter mes proches",
      url,
    }),
    priority: 8,
    scheduledAt: new Date(now + DAY_MS),
    dedupeKey: `cta-invite-${userId}`,
  });

  await queueEmail({
    to,
    subject: `${firstName}, parrainez un professionnel et gagnez plus`,
    html: buildCtaEmail({
      emoji: "🤝",
      title: "Un professionnel dans votre réseau, c'est un bonus en plus",
      body: `Bonjour ${name},<br><br>Connaissez-vous un artisan, un indépendant ou une entreprise qui pourrait rejoindre Winelio ? Invitez-le avec votre lien de parrainage : il devient votre filleul professionnel.`,
      highlight: `<strong>Votre bonus d'affiliation : 1 %</strong> sur chaque affaire conclue par un professionnel que vous avez parrainé, en plus de vos commissions de réseau. Votre code : <strong>${code}</strong>.`,
      cta: "Parrainer un professionnel",
      url,
    }),
    priority: 8,
    scheduledAt: new Date(now + 3 * DAY_MS),
    dedupeKey: `cta-pro-${userId}`,
  });
}
