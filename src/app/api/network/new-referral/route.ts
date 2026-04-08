import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST  || "dahu.o2switch.net",
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "contact@aide-multimedia.fr",
    pass: process.env.SMTP_PASS || "",
  },
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildReferralEmail(
  recipientFirstName: string,
  newMemberName: string,
  level: number
): string {
  const levelLabel =
    level === 1
      ? "votre filleul direct"
      : `un membre de votre réseau (niveau&nbsp;${level})`;

  const levelColor = level === 1 ? "#FF6B35" : "#F7931E";
  const emoji      = level === 1 ? "🎉" : "🌱";

  const iconBg = level === 1 ? "#FFF5F0" : "#FFF8EE";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau membre dans votre réseau !</title>
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

              <!-- Icône emoji + titres -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:${iconBg};border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          ${emoji}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Nouveau membre dans votre réseau !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Bonjour <strong style="color:#2D3436;">${recipientFirstName}</strong>,
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Bloc info -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                      <strong style="color:${levelColor};">${newMemberName}</strong>
                      vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.
                    </p>
                    ${level === 1 ? `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      En tant que parrain direct, vous bénéficierez d'une commission sur chaque recommandation validée de ce nouveau membre.
                    </p>` : `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau&nbsp;${level}.
                    </p>`}
                  </td>
                </tr>
              </table>

              <!-- Spacer -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Badge niveau -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:${levelColor};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 20px;border-radius:20px;text-transform:uppercase;text-align:center;">
                          Niveau ${level}
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
                        <td align="center" style="background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${SITE_URL}/network"
                             style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Voir mon réseau →
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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { newUserId } = await req.json();
    if (!newUserId) return NextResponse.json({ error: "newUserId manquant" }, { status: 400 });

    // Nom du nouveau filleul
    const { data: newProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", newUserId)
      .single();

    const newMemberName =
      [newProfile?.first_name, newProfile?.last_name].filter(Boolean).join(" ") || "Un nouveau membre";

    // Remonte la chaîne de parrainage jusqu'à 5 niveaux
    const notifications: Array<{ email: string; firstName: string; level: number }> = [];
    let currentId = newUserId;

    for (let level = 1; level <= 5; level++) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("sponsor_id, first_name, last_name")
        .eq("id", currentId)
        .single();

      if (!profile?.sponsor_id) break;

      const sponsorId = profile.sponsor_id;

      // Profil du sponsor
      const { data: sponsorProfile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", sponsorId)
        .single();

      // Email du sponsor (depuis auth)
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(sponsorId);
      const sponsorEmail = authData?.user?.email;

      // Skip les emails fictifs Winelio
      if (!sponsorEmail || sponsorEmail.endsWith("@winelio-pro.fr")) {
        currentId = sponsorId;
        continue;
      }

      notifications.push({
        email: sponsorEmail,
        firstName: sponsorProfile?.first_name || "Membre",
        level,
      });

      currentId = sponsorId;
    }

    // Envoie les emails en parallèle
    await Promise.allSettled(
      notifications.map(({ email, firstName, level }) =>
        transporter.sendMail({
          from: `"Winelio" <${process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
          to: email,
          subject: level === 1
            ? `🎉 ${newMemberName} a rejoint votre réseau Winelio !`
            : `🌱 Nouveau membre niveau ${level} dans votre réseau Winelio`,
          html: buildReferralEmail(firstName, newMemberName, level),
        })
      )
    );

    return NextResponse.json({ success: true, notified: notifications.length });
  } catch (err) {
    console.error("new-referral error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
