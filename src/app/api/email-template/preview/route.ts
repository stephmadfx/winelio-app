import { NextResponse } from "next/server";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE = "https://winelio.app";

// Données fictives pour les previews
const PRO     = "Martin Électricité";
const CONTACT = "Sophie Bernard";
const REFERRER = "Thomas Dupont";

const wrap = (body: string) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Aperçu email</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          ${body}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const icon = (emoji: string) =>
  `<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
   <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">${emoji}</td></tr></table></td></tr>
   <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

const cta = (url: string, label: string) =>
  `<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
   <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">${label}</a></td></tr></table></td></tr>`;

const infoBlock = (content: string) =>
  `<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
   <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">${content}</td></tr>`;

const TEMPLATES: Record<string, () => string> = {

  "new-reco-inscrit": () => wrap(`
    ${icon("✨")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Nouvelle recommandation&nbsp;!</h1></td></tr>
    <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">Martin</strong>,</p></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${REFERRER}</strong> vous recommande pour un projet&nbsp;!</p></td></tr>
    ${infoBlock(`<p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact</p>
    <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${CONTACT}</p>
    <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Urgence</p>
    <p style="margin:0 0 12px;color:#636E72;font-size:14px;">Normal</p>
    <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Projet</p>
    <p style="margin:0;color:#636E72;font-size:14px;line-height:1.5;">Rénovation électrique complète d'un appartement 80m².</p>`)}
    ${cta(SITE, "Voir la recommandation →")}
    <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;">Acceptez rapidement pour lancer la mise en relation.</p></td></tr>
  `),

  "new-reco-scraped": () => wrap(`
    ${icon("🤝")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Un client potentiel<br/>vous recommande&nbsp;!</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${REFERRER}</strong> a recommandé votre entreprise <strong style="color:#2D3436;">${PRO}</strong> à un contact via <strong style="color:#FF6B35;">Winelio</strong>.</p></td></tr>
    ${infoBlock(`<p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Le projet</p>
    <p style="margin:0 0 12px;color:#636E72;font-size:14px;line-height:1.5;">Rénovation électrique complète d'un appartement 80m².</p>
    <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact intéressé</p>
    <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${CONTACT}</p>
    <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Urgence</p>
    <p style="margin:0;color:#636E72;font-size:14px;">Normal</p>`)}
    <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Pour <strong>récupérer ce lead</strong>, revendiquez votre fiche sur Winelio — c'est <strong>gratuit</strong>.</p></td></tr>
    ${cta(SITE, "Récupérer ma fiche gratuitement →")}
  `),

  "relance-scraped": () => wrap(`
    ${icon("🔔")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Rappel — Un client vous attend</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Nous vous avons contacté hier au sujet d'un lead qualifié. <strong style="color:#2D3436;">${REFERRER}</strong> a recommandé votre entreprise <strong style="color:#2D3436;">${PRO}</strong> à <strong style="color:#2D3436;">${CONTACT}</strong> via Winelio.</p></td></tr>
    ${infoBlock(`<p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Ce lead est toujours disponible. Pour le récupérer, revendiquez votre fiche Winelio gratuitement.</p>`)}
    ${cta(SITE, "Récupérer mon lead →")}
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;">Ce rappel est envoyé une seule fois. Si vous n'êtes pas intéressé, ignorez cet email.</p></td></tr>
  `),

  "alerte-recommandeur": () => wrap(`
    ${icon("📭")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Le professionnel n'a pas répondu</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Malgré deux emails envoyés à <strong style="color:#2D3436;">${PRO}</strong>, ce professionnel n'a pas encore consulté votre recommandation pour <strong style="color:#2D3436;">${CONTACT}</strong>.</p></td></tr>
    ${infoBlock(`<p style="margin:0;color:#2D3436;font-size:14px;font-weight:600;margin-bottom:8px;">Que faire maintenant ?</p>
    <p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Créez une nouvelle recommandation vers un autre professionnel pour ne pas faire attendre <strong>${CONTACT}</strong>.</p>`)}
    ${cta(`${SITE}/recommendations/new`, "Recommander un autre pro →")}
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;">Winelio a contacté ce professionnel deux fois en 36 heures sans succès.</p></td></tr>
  `),

  "reco-refusee": () => wrap(`
    ${icon("😔")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Recommandation déclinée</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a décliné votre recommandation pour <strong style="color:#2D3436;">${CONTACT}</strong>.</p></td></tr>
    ${infoBlock(`<p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Pas d'inquiétude — vous pouvez recommander un autre professionnel pour ce contact.</p>`)}
    ${cta(`${SITE}/recommendations/new`, "Recommander un autre pro →")}
  `),

  "commission": () => wrap(`
    ${icon("💰")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Commission à régler</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Suite à la recommandation de <strong style="color:#2D3436;">${REFERRER}</strong>, les travaux pour <strong style="color:#2D3436;">${CONTACT}</strong> sont terminés. Réglez votre commission Winelio.</p></td></tr>
    ${infoBlock(`<p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Montant de la commission</p>
    <p style="margin:0;color:#FF6B35;font-size:28px;font-weight:800;">180,00 €</p>`)}
    ${cta(SITE, "Régler ma commission →")}
  `),

  "step-2": () => wrap(`
    ${icon("🎉")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">${PRO} a accepté&nbsp;!</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a accepté votre recommandation pour <strong style="color:#2D3436;">${CONTACT}</strong> et va prendre contact prochainement.</p></td></tr>
    ${cta(`${SITE}/recommendations/demo`, "Voir la recommandation →")}
  `),

  "step-3": () => wrap(`
    ${icon("📞")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Contact établi avec ${CONTACT}</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a pris contact avec <strong style="color:#2D3436;">${CONTACT}</strong>. La mission avance&nbsp;!</p></td></tr>
    ${cta(`${SITE}/recommendations/demo`, "Voir la recommandation →")}
  `),

  "step-4": () => wrap(`
    ${icon("📅")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Rendez-vous fixé</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a fixé un rendez-vous avec <strong style="color:#2D3436;">${CONTACT}</strong>. Tout se déroule parfaitement.</p></td></tr>
    ${cta(`${SITE}/recommendations/demo`, "Voir la recommandation →")}
  `),

  "step-5": () => wrap(`
    ${icon("📄")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Devis soumis</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a soumis un devis à <strong style="color:#2D3436;">${CONTACT}</strong>. Si le client l'accepte, votre commission sera calculée sur ce montant.</p></td></tr>
    ${cta(`${SITE}/recommendations/demo`, "Voir la recommandation →")}
  `),

  "step-6": () => wrap(`
    ${icon("✅")}
    <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Travaux terminés — affaire conclue&nbsp;!</h1></td></tr>
    <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${PRO}</strong> a confirmé que les travaux sont terminés et que le paiement de <strong style="color:#2D3436;">${CONTACT}</strong> a été reçu.<br><br>Vos <strong style="color:#FF6B35;">commissions sont en cours de traitement</strong>.</p></td></tr>
    ${infoBlock(`<p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Retrouvez le détail de vos commissions dans votre <strong>wallet Winelio</strong> dès leur validation.</p>`)}
    ${cta(`${SITE}/recommendations/demo`, "Voir la recommandation →")}
  `),
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const builder = TEMPLATES[type];
  if (!builder) {
    return new NextResponse(`Type inconnu : ${type}`, { status: 404 });
  }
  return new NextResponse(builder(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
