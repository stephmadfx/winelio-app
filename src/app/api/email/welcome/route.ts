import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "dahu.o2switch.net",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "contact@aide-multimedia.fr",
    pass: process.env.SMTP_PASS || "",
  },
});

function buildWelcomeEmail(firstName: string, sponsorCode: string): string {
  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";
  const networkUrl = `${dashboardUrl}/network`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur Winelio !</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Barre accent top -->
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>

          <!-- Carte blanche -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">

              <!-- Logo -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png"
                         alt="Winelio" width="160" height="44"
                         style="display:block;margin:0 auto;border:0;max-width:160px;" />
                  </td>
                </tr>
                <!-- Séparateur sous logo -->
                <tr>
                  <td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Section hero dans la carte -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!-- Icône 🎉 dans carré gradient -->
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          🎉
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Bienvenue sur Winelio, ${firstName} !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Votre compte est activé. Vous faites partie du réseau.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Séparateur -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- 3 blocs avantages -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Avantage 1 -->
                <tr>
                  <td style="padding:14px 16px;background:#FFF5F0;border-radius:12px;border-left:3px solid #FF6B35;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" style="vertical-align:top;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                💸
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <p style="font-weight:700;color:#2D3436;font-size:14px;margin:0 0 4px;">Recommandation directe</p>
                          <p style="color:#636E72;font-size:13px;line-height:1.5;margin:0;">Touchez <strong style="color:#FF6B35;">60% de la commission</strong> sur chaque mise en relation aboutie.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- Avantage 2 -->
                <tr>
                  <td style="padding:14px 16px;background:#FFF5F0;border-radius:12px;border-left:3px solid #F7931E;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" style="vertical-align:top;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                🌐
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <p style="font-weight:700;color:#2D3436;font-size:14px;margin:0 0 4px;">Votre réseau sur 5 niveaux</p>
                          <p style="color:#636E72;font-size:13px;line-height:1.5;margin:0;">Invitez des membres et percevez une commission sur leurs recommandations validées.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>

                <!-- Avantage 3 -->
                <tr>
                  <td style="padding:14px 16px;background:#FFF5F0;border-radius:12px;border-left:3px solid #FF6B35;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="44" style="vertical-align:top;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                🏆
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <p style="font-weight:700;color:#2D3436;font-size:14px;margin:0 0 4px;">Plus vous êtes actif, plus vous gagnez</p>
                          <p style="color:#636E72;font-size:13px;line-height:1.5;margin:0;">Les membres engagés construisent une vraie source de revenus complémentaires.</p>
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

              <!-- Bloc code parrain -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF5F0;border:1.5px dashed #FF6B35;border-radius:12px;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 10px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#636E72;font-weight:600;">Votre code parrain</p>
                    <p style="margin:0 0 10px;font-size:32px;font-weight:900;letter-spacing:6px;color:#FF6B35;font-family:'Courier New',Courier,monospace;">${sponsorCode}</p>
                    <p style="margin:0;font-size:13px;color:#636E72;line-height:1.5;">
                      Partagez ce code à vos proches pour les inviter sur Winelio<br/>et commencer à gagner ensemble.
                    </p>
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
                        <td align="center" style="background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${networkUrl}"
                             style="display:inline-block;color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
                            Inviter mes premiers membres →
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

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, sponsor_code")
      .eq("id", user.id)
      .single();

    if (!profile?.sponsor_code) {
      return NextResponse.json({ error: "Profil incomplet" }, { status: 400 });
    }

    const firstName = profile.first_name || profile.last_name || "Nouveau membre";

    await transporter.sendMail({
      from: `"Winelio" <${process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
      to: user.email!,
      subject: `Bienvenue sur Winelio, ${firstName} ! 🎉`,
      html: buildWelcomeEmail(firstName, profile.sponsor_code),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("welcome email error:", err);
    return NextResponse.json({ error: "Erreur envoi email" }, { status: 500 });
  }
}
