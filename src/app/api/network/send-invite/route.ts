import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || "dahu.o2switch.net",
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "contact@aide-multimedia.fr",
    pass: process.env.SMTP_PASS || "",
  },
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

function buildInviteEmail(
  senderName: string,
  recipientEmail: string,
  referralCode: string,
  personalMessage?: string
): string {
  const referralUrl = `${SITE_URL}/auth/login?mode=register&ref=${referralCode}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation Winelio</title>
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

              <!-- Header section -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!-- Icône 🤝 dans carré gradient -->
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          🤝
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Vous êtes invité(e) à rejoindre Winelio !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      <strong style="color:#2D3436;">${senderName}</strong> souhaite vous avoir dans son réseau
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

              ${personalMessage ? `
              <!-- Message personnel -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
                    <p style="margin:0;color:#2D3436;font-size:14px;font-style:italic;line-height:1.6;">
                      "${personalMessage}"
                    </p>
                    <p style="margin:8px 0 0;color:#636E72;font-size:12px;">— ${senderName}</p>
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>` : ""}

              <!-- Qu'est-ce que Winelio -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="color:#2D3436;font-size:15px;font-weight:600;margin:0 0 10px;">Qu'est-ce que Winelio ?</p>
                    <p style="color:#636E72;font-size:14px;line-height:1.7;margin:0;">
                      Winelio est la plateforme qui transforme vos recommandations en revenus.
                      Mettez en relation vos proches avec des professionnels de confiance
                      et soyez récompensé à chaque mission validée.
                    </p>
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- 3 avantages -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #F0F2F4;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="40" style="vertical-align:middle;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:#FFF5F0;border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                💸
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <span style="color:#2D3436;font-size:14px;line-height:1.5;">Gagnez des commissions sur chaque recommandation validée</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #F0F2F4;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="40" style="vertical-align:middle;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:#FFF5F0;border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                🌐
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <span style="color:#2D3436;font-size:14px;line-height:1.5;">Développez votre réseau sur 5 niveaux de parrainage</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:12px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="40" style="vertical-align:middle;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" style="width:36px;height:36px;background:#FFF5F0;border-radius:8px;font-size:18px;line-height:36px;text-align:center;vertical-align:middle;">
                                ⭐
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <span style="color:#2D3436;font-size:14px;line-height:1.5;">Accédez à un réseau de professionnels vérifiés</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Code parrain -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 8px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Votre code de parrainage</p>
                    <p style="margin:0;font-size:26px;font-weight:900;color:#FF6B35;letter-spacing:5px;font-family:'Courier New',Courier,monospace;">${referralCode.toUpperCase()}</p>
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
                          <a href="${referralUrl}"
                             style="display:inline-block;color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
                            Rejoindre Winelio →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="margin:0;color:#B2BAC0;font-size:11px;">
                      Ou copiez ce lien : <a href="${referralUrl}" style="color:#FF6B35;word-break:break-all;text-decoration:none;">${referralUrl}</a>
                    </p>
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

export async function POST(req: Request) {
  try {
    // Vérifie l'auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { to, personalMessage } = await req.json();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
    }

    // Récupère le profil de l'expéditeur
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, sponsor_code")
      .eq("id", user.id)
      .single();

    if (!profile?.sponsor_code) {
      return NextResponse.json({ error: "Code parrainage introuvable" }, { status: 400 });
    }

    const senderName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Un membre Winelio";

    await transporter.sendMail({
      from: `"${senderName} via Winelio" <${process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
      to,
      replyTo: user.email,
      subject: `${senderName} vous invite à rejoindre Winelio 🤝`,
      html: buildInviteEmail(senderName, to, profile.sponsor_code, personalMessage),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-invite error:", err);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }
}
