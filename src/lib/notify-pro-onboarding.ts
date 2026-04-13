/**
 * Envoie un email de confirmation au professionnel qui vient de compléter
 * son onboarding Pro (wizard 3 étapes).
 */
import nodemailer from "nodemailer";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const _smtpPort = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: _smtpPort,
  secure: _smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Distanciel (en ligne)",
  onsite: "Présentiel (en personne)",
  both: "Distanciel & Présentiel",
};

function buildProConfirmEmail(
  firstName: string,
  workModeLabel: string,
  categoryName: string
): string {
  const profileUrl = `${SITE_URL}/profile`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre fiche Pro Winelio est activée !</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          <!-- Barre accent top -->
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>

          <!-- Carte blanche -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">

              <!-- Logo + séparateur -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <span style="font-size:11px;color:#FF6B35;font-weight:600;letter-spacing:1px;">Recommandez. Connectez. Gagnez.</span>
                  </td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Icône + titre -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          🚀
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Votre fiche Pro est activée, ${he(firstName)} !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Vous êtes maintenant visible parmi les professionnels Winelio.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Récap fiche -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 12px 12px 0;padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#FF6B35;text-transform:uppercase;letter-spacing:1px;">Votre fiche professionnelle</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Catégorie</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(categoryName)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Mode de travail</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(workModeLabel)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Bloc désactivation -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" style="vertical-align:top;padding-top:2px;">
                          <span style="font-size:18px;">💡</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;">
                          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#2D3436;">Vous gardez le contrôle</p>
                          <p style="margin:0;font-size:13px;color:#636E72;line-height:1.6;">
                            Vous pouvez à tout moment <strong style="color:#2D3436;">désactiver votre compte professionnel</strong> depuis votre profil. Vous n'apparaîtrez plus dans la liste des professionnels disponibles, et vous pourrez le réactiver quand vous le souhaitez.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Bouton CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${profileUrl}"
                             style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Gérer mon profil →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Spacer bottom -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">
                © 2026 Winelio · Plateforme de recommandation professionnelle
              </p>
              <p style="color:#FF6B35;font-size:11px;margin:0;">
                Recommandez. Connectez. Gagnez.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function notifyProOnboarding({
  email,
  firstName,
  workMode,
  categoryName,
}: {
  email: string;
  firstName: string;
  workMode: string;
  categoryName: string;
}): Promise<void> {
  const workModeLabel = WORK_MODE_LABELS[workMode] ?? workMode;

  await transporter.sendMail({
    from: `"Winelio" <${process.env.SMTP_USER || "support@winelio.app"}>`,
    to: email,
    subject: `${firstName}, votre fiche Pro Winelio est activée ! 🚀`,
    html: buildProConfirmEmail(firstName, workModeLabel, categoryName),
  });
}
