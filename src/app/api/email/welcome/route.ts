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
  const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://buzreco.fr";
  const networkUrl = `${dashboardUrl}/network`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur Buzreco !</title>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="font-size:32px;font-weight:900;letter-spacing:-1px;line-height:1;">
                <span style="color:#2D3436;">BUZ</span><span style="color:#FF6B35;">RE</span><span style="color:#2D3436;">CO</span>
              </div>
              <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#636E72;margin-top:6px;font-weight:500;">
                Plateforme de recommandation
              </div>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:20px;padding:48px 40px;text-align:center;">
              <div style="font-size:48px;margin-bottom:16px;">🎉</div>
              <h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0 0 12px;line-height:1.3;">
                Bienvenue ${firstName} !
              </h1>
              <p style="color:rgba(255,255,255,0.9);font-size:16px;margin:0;line-height:1.7;">
                Votre compte Buzreco est activé.<br/>
                Vous faites maintenant partie du réseau.
              </p>
            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;padding:40px;margin-top:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

              <h2 style="color:#2D3436;font-size:20px;font-weight:700;margin:0 0 8px;">
                Recommandez et gagnez
              </h2>
              <p style="color:#636E72;font-size:15px;line-height:1.7;margin:0 0 28px;">
                Buzreco vous permet de monétiser votre réseau de confiance.
                Chaque recommandation validée vous rapporte une commission directe.
              </p>

              <!-- Revenue steps -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">

                <tr>
                  <td style="padding:14px 16px;background:#FFF8F5;border-radius:12px;margin-bottom:8px;border-left:3px solid #FF6B35;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:2px;">
                          <div style="width:32px;height:32px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:8px;text-align:center;line-height:32px;font-size:16px;">💸</div>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <div style="font-weight:700;color:#2D3436;font-size:14px;margin-bottom:3px;">Recommandation directe</div>
                          <div style="color:#636E72;font-size:13px;line-height:1.5;">Touchez <strong style="color:#FF6B35;">60% de la commission</strong> sur chaque mise en relation que vous faites aboutir.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:8px;"></td></tr>

                <tr>
                  <td style="padding:14px 16px;background:#F0FFF4;border-radius:12px;border-left:3px solid #48BB78;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:2px;">
                          <div style="width:32px;height:32px;background:linear-gradient(135deg,#48BB78,#38A169);border-radius:8px;text-align:center;line-height:32px;font-size:16px;">🌐</div>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <div style="font-weight:700;color:#2D3436;font-size:14px;margin-bottom:3px;">Développez votre réseau</div>
                          <div style="color:#636E72;font-size:13px;line-height:1.5;">Invitez des membres. À chaque recommandation de votre réseau, vous percevez <strong style="color:#48BB78;">une commission sur 5 niveaux</strong> — même en dormant.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:8px;"></td></tr>

                <tr>
                  <td style="padding:14px 16px;background:#EBF8FF;border-radius:12px;border-left:3px solid #4299E1;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:2px;">
                          <div style="width:32px;height:32px;background:linear-gradient(135deg,#4299E1,#3182CE);border-radius:8px;text-align:center;line-height:32px;font-size:16px;">🏆</div>
                        </td>
                        <td style="padding-left:12px;vertical-align:top;">
                          <div style="font-weight:700;color:#2D3436;font-size:14px;margin-bottom:3px;">Les plus actifs gagnent plus</div>
                          <div style="color:#636E72;font-size:13px;line-height:1.5;">Plus votre réseau est grand et actif, plus vos revenus passifs augmentent. Les membres les plus engagés construisent une <strong style="color:#4299E1;">véritable source de revenus complémentaires</strong>.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>

              <!-- Sponsor code -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F5;border:1.5px dashed #FF6B35;border-radius:14px;margin-bottom:32px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#636E72;font-weight:600;margin-bottom:10px;">Votre code parrain</div>
                    <div style="font-size:32px;font-weight:900;letter-spacing:6px;color:#FF6B35;font-family:Courier New,monospace;">${sponsorCode}</div>
                    <div style="font-size:13px;color:#636E72;margin-top:8px;line-height:1.5;">
                      Partagez ce code à vos proches pour les inviter sur Buzreco<br/>et commencer à gagner ensemble.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${networkUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;">
                      Inviter mes premiers membres →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="font-size:12px;color:#B2BEC3;margin:0 0 4px;">Cet email a été envoyé par Buzreco</p>
              <p style="font-size:12px;color:#DFE6E9;margin:0;">© ${new Date().getFullYear()} Buzreco. Tous droits réservés.</p>
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
      from: `"Buzreco" <${process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
      to: user.email!,
      subject: `Bienvenue sur Buzreco, ${firstName} ! 🎉`,
      html: buildWelcomeEmail(firstName, profile.sponsor_code),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("welcome email error:", err);
    return NextResponse.json({ error: "Erreur envoi email" }, { status: 500 });
  }
}
