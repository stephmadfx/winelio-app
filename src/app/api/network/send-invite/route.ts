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
</head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png"
                   alt="Winelio" width="160" height="44"
                   style="display:block;margin:0 auto;border:0;max-width:160px;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);">

              <!-- Header gradient -->
              <div style="background:linear-gradient(135deg,#FF6B35,#F7931E);padding:36px 36px 28px;text-align:center;">
                <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);line-height:72px;font-size:36px;margin-bottom:16px;">
                  🤝
                </div>
                <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 8px;">
                  Vous êtes invité(e) à rejoindre Winelio !
                </h1>
                <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">
                  <strong>${senderName}</strong> souhaite vous avoir dans son réseau
                </p>
              </div>

              <!-- Body -->
              <div style="padding:32px 36px;">

                ${personalMessage ? `
                <!-- Message personnel -->
                <div style="background:#fff8f5;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
                  <p style="margin:0;color:#2D3436;font-size:14px;font-style:italic;line-height:1.6;">
                    "${personalMessage}"
                  </p>
                  <p style="margin:8px 0 0;color:#636E72;font-size:12px;">— ${senderName}</p>
                </div>` : ""}

                <!-- What is Winelio -->
                <p style="color:#2D3436;font-size:15px;font-weight:600;margin:0 0 12px;">
                  Qu'est-ce que Winelio ?
                </p>
                <p style="color:#636E72;font-size:14px;line-height:1.7;margin:0 0 24px;">
                  Winelio est la plateforme qui transforme vos recommandations en revenus.
                  Mettez en relation vos proches avec des professionnels de confiance
                  et soyez récompensé à chaque mission validée.
                </p>

                <!-- Benefits -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
                      <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#fff3ee;text-align:center;line-height:32px;font-size:16px;vertical-align:middle;">💸</span>
                      <span style="color:#2D3436;font-size:14px;margin-left:12px;vertical-align:middle;">Gagnez des commissions sur chaque recommandation validée</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
                      <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#fff3ee;text-align:center;line-height:32px;font-size:16px;vertical-align:middle;">🌐</span>
                      <span style="color:#2D3436;font-size:14px;margin-left:12px;vertical-align:middle;">Développez votre réseau sur 5 niveaux de parrainage</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#fff3ee;text-align:center;line-height:32px;font-size:16px;vertical-align:middle;">⭐</span>
                      <span style="color:#2D3436;font-size:14px;margin-left:12px;vertical-align:middle;">Accédez à un réseau de professionnels vérifiés</span>
                    </td>
                  </tr>
                </table>

                <!-- Referral code -->
                <div style="background:#f8f9fa;border-radius:12px;padding:16px 20px;margin-bottom:28px;text-align:center;">
                  <p style="margin:0 0 6px;color:#636E72;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Votre code de parrainage</p>
                  <p style="margin:0;font-size:24px;font-weight:900;color:#FF6B35;letter-spacing:4px;">${referralCode.toUpperCase()}</p>
                </div>

                <!-- CTA -->
                <div style="text-align:center;">
                  <a href="${referralUrl}"
                     style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#ffffff;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.5px;">
                    Rejoindre Winelio →
                  </a>
                  <p style="margin:12px 0 0;color:#adb5bd;font-size:11px;">
                    Ou copiez ce lien : <a href="${referralUrl}" style="color:#FF6B35;word-break:break-all;">${referralUrl}</a>
                  </p>
                </div>

              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="color:#adb5bd;font-size:12px;margin:0 0 4px;">
                © Winelio · <a href="${SITE_URL}" style="color:#FF6B35;text-decoration:none;">winelio.fr</a>
              </p>
              <p style="color:#ced4da;font-size:11px;margin:0;">
                Vous recevez cet email car ${senderName} vous a invité(e) personnellement.
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
