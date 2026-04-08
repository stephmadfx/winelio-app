import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Votre code de connexion Winelio</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:48px 20px 40px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          <!-- Barre accent top -->
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;border-radius:4px 4px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Carte principale -->
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">

              <!-- Logo -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;border-bottom:1px solid #F0F2F4;">
                    <span style="font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1;">
                      <span style="color:#FF6B35;">W</span><span style="color:#2D3436;">inelio</span>
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Corps -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-top:32px;">

                    <!-- Icône -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
                      <tr>
                        <td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;">
                          <span style="font-size:24px;line-height:52px;">🔑</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Titre -->
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0 0 10px;letter-spacing:-0.3px;">
                      Votre code de connexion
                    </h1>
                    <p style="color:#636E72;font-size:15px;margin:0 0 36px;line-height:1.65;">
                      Saisissez ce code dans l&apos;application pour accéder à votre compte Winelio.
                    </p>

                    <!-- Code -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td style="background:#FFF5F0;border:2px solid #FF6B35;border-radius:14px;padding:20px 44px;text-align:center;">
                          <span style="font-size:44px;font-weight:800;letter-spacing:12px;color:#2D3436;font-family:'Courier New',Courier,monospace;display:block;">
                            ${code}
                          </span>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 0;">
                      <tr>
                        <td style="background:#F8F9FA;border-radius:20px;padding:6px 14px;">
                          <span style="font-size:12px;color:#636E72;font-weight:500;">
                            Expire dans <strong style="color:#2D3436;">24 heures</strong>
                          </span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Note sécurité -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;">
                <tr>
                  <td style="background:#F8F9FA;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:14px 16px;">
                    <p style="color:#636E72;font-size:12px;margin:0;line-height:1.65;">
                      Ce code est <strong style="color:#2D3436;">strictement personnel</strong> et à usage unique.<br>
                      Si vous n&apos;avez pas fait cette demande, ignorez cet email — votre compte est en sécurité.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">
                © 2026 Winelio · Plateforme de recommandation professionnelle
              </p>
              <p style="margin:0;">
                <span style="font-size:11px;color:#FF6B35;font-weight:600;letter-spacing:0.5px;">
                  Recommandez. Connectez. Gagnez.
                </span>
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
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Store code in Supabase (upsert → replace existing code for same email)
    const { error: dbError } = await supabaseAdmin
      .from("otp_codes")
      .upsert({ email, code, expires_at: expiresAt }, { onConflict: "email" });

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json(
        { error: "Erreur serveur. Réessayez." },
        { status: 500 }
      );
    }

    // Send custom email
    await transporter.sendMail({
      from: `"${process.env.SMTP_SENDER_NAME || "Winelio"}" <${process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
      to: email,
      subject: "Votre code de connexion Winelio",
      html: buildEmailHtml(code),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
