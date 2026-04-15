/**
 * Envoie un rappel automatique 15 jours après l'activation Pro
 * si le professionnel n'a pas renseigné son numéro SIRET.
 *
 * Appelé depuis completeProOnboarding() quand siret === null.
 */
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.app";

/** Délai avant l'envoi du rappel */
const REMINDER_DAYS = 15;

function buildSiretReminderEmail(firstName: string): string {
  const companiesUrl = `${SITE_URL}/companies`;
  const deadlineLabel = `${REMINDER_DAYS} jours`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action requise : complétez votre numéro SIRET</title>
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
                          ⚠️
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Action requise, ${he(firstName)} !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;line-height:1.6;">
                      Votre compte professionnel Winelio est actif, mais il vous manque encore votre <strong style="color:#2D3436;">numéro SIRET</strong> pour finaliser votre profil.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Bloc alerte -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 12px 12px 0;padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" style="vertical-align:top;padding-top:2px;">
                          <span style="font-size:18px;">📋</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;">
                          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#2D3436;">Pourquoi c'est important</p>
                          <p style="margin:0;font-size:13px;color:#636E72;line-height:1.6;">
                            Le numéro SIRET permet de vérifier votre activité professionnelle et d'assurer la confiance des clients qui vous recommandent. Sans ce numéro, votre compte professionnel pourra être <strong style="color:#FF6B35;">suspendu après ${he(deadlineLabel)}</strong>.
                          </p>
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

              <!-- Étapes -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#2D3436;text-transform:uppercase;letter-spacing:1px;">Comment ajouter votre SIRET</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #EFEFEF;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="24" style="font-size:13px;font-weight:700;color:#FF6B35;vertical-align:top;">1.</td>
                              <td style="font-size:13px;color:#636E72;">Connectez-vous à votre espace Winelio</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #EFEFEF;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="24" style="font-size:13px;font-weight:700;color:#FF6B35;vertical-align:top;">2.</td>
                              <td style="font-size:13px;color:#636E72;">Accédez à <strong style="color:#2D3436;">Mon entreprise</strong></td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="24" style="font-size:13px;font-weight:700;color:#FF6B35;vertical-align:top;">3.</td>
                              <td style="font-size:13px;color:#636E72;">Renseignez votre <strong style="color:#2D3436;">numéro SIRET</strong> (14 chiffres)</td>
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
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Bouton CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${companiesUrl}"
                             style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Ajouter mon SIRET →
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

export async function notifySiretReminder({
  email,
  firstName,
}: {
  email: string;
  firstName: string;
}): Promise<void> {
  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + REMINDER_DAYS);

  await queueEmail({
    to: email,
    subject: `${firstName}, votre SIRET est requis pour conserver votre compte Pro`,
    html: buildSiretReminderEmail(firstName),
    priority: 5,
    scheduledAt,
  });
}
