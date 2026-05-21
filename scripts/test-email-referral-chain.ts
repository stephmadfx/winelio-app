/**
 * Script de test — envoie un email "nouveau filleul niveau 4" à une adresse cible.
 * Usage : npx tsx scripts/test-email-referral-chain.ts
 */
import nodemailer from "nodemailer";
import { he } from "../src/lib/html-escape";

const SMTP = {
  host: "ssl0.ovh.net",
  port: 465,
  secure: true,
  auth: { user: "support@winelio.app", pass: "Winelio2026!#" },
};

const LOGO_URL = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";
const LOGO_IMG_HTML = `<img src="${LOGO_URL}" width="160" height="44" alt="Winelio" style="display:block;margin:0 auto;border:0;max-width:160px;" />`;

const DEST = "contact@aide-multimedia.fr";
const SITE_URL = "https://winelio.app";

// ── Données fictives ──────────────────────────────────────────────
const newMemberShortName = "Sophie D.";   // filleul niveau 4 (Prénom + initiale)

const chain = [
  { name: "Jean M.",    level: 1 },       // parrain direct du filleul
  { name: "Isabelle T.", level: 2 },      // niveau 2
  { name: "Pierre L.",  level: 3 },       // niveau 3
  // Le destinataire est niveau 4 — il ne se voit pas dans sa propre chaîne
];

const recipient = { firstName: "Stéphane", level: 4 };
// ──────────────────────────────────────────────────────────────────

function buildChainHtml(entries: { name: string; level: number }[]): string {
  const rows = entries.map((e) => {
    const label = e.level === 1 ? "parrain direct" : `niveau&nbsp;${e.level}`;
    return `<tr><td style="padding:3px 0;color:#636E72;font-size:13px;line-height:1.6;">
      &bull;&nbsp;<strong style="color:#2D3436;">${he(e.name)}</strong>
      <span style="color:#B2BAC0;font-size:12px;">&nbsp;(${label})</span>
    </td></tr>`;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
    <tr><td style="color:#636E72;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:6px;">Chaîne de parrainage</td></tr>
    ${rows}
  </table>`;
}

const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Nouveau membre dans votre réseau !</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
            <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td></tr>
            <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" style="width:52px;height:52px;background:#FFF8EE;border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">🌱</td>
              </tr></table>
            </td></tr>
            <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td align="center">
              <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">Nouveau membre dans votre réseau !</h1>
            </td></tr>
            <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td align="center">
              <p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(recipient.firstName)}</strong>,</p>
            </td></tr>
            <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>

            <!-- Bloc info -->
            <tr><td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
              <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                <strong style="color:#F7931E;">${he(newMemberShortName)}</strong>
                vient de rejoindre Winelio en tant que un membre de votre réseau (niveau&nbsp;${recipient.level}).
              </p>
              <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau&nbsp;${recipient.level}.
              </p>
              ${buildChainHtml(chain)}
            </td></tr>

            <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="background:#F7931E;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 20px;border-radius:20px;text-transform:uppercase;text-align:center;">
                  Niveau ${recipient.level}
                </td>
              </tr></table>
            </td></tr>
            <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>

            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                  <a href="${SITE_URL}/network" style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                    Voir mon réseau →
                  </a>
                </td>
              </tr></table>
            </td></tr>
            <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:24px;">
          <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p>
          <p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const text = [
  `Bonjour ${recipient.firstName},`,
  "",
  `${newMemberShortName} vient de rejoindre Winelio en tant que membre niveau ${recipient.level} dans votre réseau.`,
  "",
  `Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau ${recipient.level}.`,
  "",
  "Chaîne de parrainage :",
  ...chain.map((e) => `  • ${e.name} (${e.level === 1 ? "parrain direct" : `niveau ${e.level}`})`),
  "",
  `Voir mon réseau : ${SITE_URL}/network`,
  "",
  "---",
  "© 2026 Winelio · Recommandez. Connectez. Gagnez.",
].join("\n");

(async () => {
  const transporter = nodemailer.createTransport(SMTP);
  await transporter.sendMail({
    from: `"Winelio" <support@winelio.app>`,
    to: DEST,
    subject: `[TEST] Nouveau membre niveau ${recipient.level} dans votre réseau Winelio`,
    html,
    text,
  });
  console.log(`✅ Email de test envoyé à ${DEST}`);
})();
