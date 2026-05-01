/**
 * Email envoyé au support Winelio quand un pro demande la modification
 * d'une donnée légale verrouillée (SIRET / SIREN / code NAF) sur sa fiche entreprise.
 */
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";

const SUPPORT_EMAIL = "support@winelio.app";

interface CompanyModificationRequestParams {
  requesterEmail: string;
  requesterName: string;
  companyName: string;
  companyId: string;
  siret: string | null;
  siren: string | null;
  nafCode: string | null;
  insuranceNumber: string | null;
  reason: string;
}

function buildSupportEmail(p: CompanyModificationRequestParams): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demande de modification de fiche pro</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <span style="font-size:11px;color:#FF6B35;font-weight:600;letter-spacing:1px;">Support · Modification fiche pro</span>
                  </td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          📝
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Demande de modification de fiche pro
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:14px;margin:0;">
                      Un professionnel souhaite modifier ses données légales verrouillées.
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Identité du pro -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#2D3436;text-transform:uppercase;letter-spacing:1px;">Demandeur</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #ECEFF2;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Nom</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(p.requesterName)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Email</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(p.requesterEmail)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Données actuelles -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 12px 12px 0;padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#FF6B35;text-transform:uppercase;letter-spacing:1px;">Fiche actuelle</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Entreprise</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(p.companyName)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">SIRET</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;font-family:monospace;">${he(p.siret ?? "—")}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">SIREN</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;font-family:monospace;">${he(p.siren ?? "—")}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Code NAF</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;font-family:monospace;">${he(p.nafCode ?? "—")}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">N° assurance pro</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;font-family:monospace;">${he(p.insuranceNumber ?? "—")}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">ID interne</td>
                              <td style="font-size:12px;color:#636E72;font-family:monospace;">${he(p.companyId)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Raison -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#2D3436;text-transform:uppercase;letter-spacing:1px;">Raison de la demande</p>
                    <p style="margin:0;font-size:14px;color:#2D3436;line-height:1.6;white-space:pre-wrap;">${he(p.reason)}</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

            </td>
          </tr>

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

export async function notifyCompanyModificationRequest(
  params: CompanyModificationRequestParams
): Promise<void> {
  await queueEmail({
    to: SUPPORT_EMAIL,
    subject: `📝 Modification fiche pro · ${params.companyName} (SIRET ${params.siret ?? "—"})`,
    html: buildSupportEmail(params),
    replyTo: params.requesterEmail,
    priority: 3,
  });
}
