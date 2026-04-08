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
              <div style="font-size:30px;font-weight:800;line-height:1;letter-spacing:-1px;">
                <span style="color:#FF6B35;">W</span><span style="color:#2D3436;">inelio</span>
              </div>
              <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#636E72;margin-top:4px;">
                Réseau de recommandation
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 2px 16px rgba(0,0,0,0.06);">

              <!-- Icône niveau -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;width:64px;height:64px;border-radius:50%;background:${levelColor}1a;line-height:64px;font-size:32px;">
                  ${emoji}
                </div>
              </div>

              <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0 0 8px;text-align:center;">
                Nouveau membre dans votre réseau !
              </h1>

              <p style="color:#636E72;font-size:15px;text-align:center;margin:0 0 28px;">
                Bonjour ${recipientFirstName},
              </p>

              <!-- Bloc info -->
              <div style="background:#f8f9fa;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                  <strong style="color:${levelColor};">${newMemberName}</strong>
                  vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.
                </p>
                ${level === 1 ? `
                <p style="margin:12px 0 0;color:#636E72;font-size:13px;">
                  En tant que parrain direct, vous bénéficierez d'une commission sur chaque recommandation validée de ce nouveau membre.
                </p>` : `
                <p style="margin:12px 0 0;color:#636E72;font-size:13px;">
                  Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau&nbsp;${level}.
                </p>`}
              </div>

              <!-- Badge niveau -->
              <div style="text-align:center;margin-bottom:28px;">
                <span style="display:inline-block;background:${levelColor};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 16px;border-radius:20px;text-transform:uppercase;">
                  Niveau ${level}
                </span>
              </div>

              <!-- CTA -->
              <div style="text-align:center;">
                <a href="${SITE_URL}/network"
                   style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">
                  Voir mon réseau
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="color:#adb5bd;font-size:12px;margin:0;">
                © Winelio · <a href="${SITE_URL}" style="color:#FF6B35;text-decoration:none;">winelio.fr</a>
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
