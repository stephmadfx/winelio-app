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
  <title>Votre code Buzreco</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="font-size:28px;font-weight:800;line-height:1;">
                <span style="color:#ffffff;">BUZ</span><span style="color:#f97316;">RE</span><span style="color:#ffffff;">CO</span>
              </div>
              <div style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#475569;margin-top:6px;">
                Plateforme de recommandation
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#1e2230;border:1px solid #2a3142;border-radius:16px;padding:40px 32px;text-align:center;">

              <!-- Title -->
              <h1 style="color:#f8fafc;font-size:20px;font-weight:700;margin:0 0 8px;">
                Votre code de connexion
              </h1>
              <p style="color:#94a3b8;font-size:14px;margin:0 0 32px;line-height:1.6;">
                Saisissez ce code dans l'application pour vous connecter.
              </p>

              <!-- Code label -->
              <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin:0 0 10px;">
                Code a 6 chiffres
              </p>

              <!-- Code box -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;">
                <tr>
                  <td style="background:#161a26;border:2px solid #f97316;border-radius:12px;padding:18px 40px;text-align:center;">
                    <span style="font-size:46px;font-weight:800;letter-spacing:14px;color:#ffffff;font-family:Courier New,Courier,monospace;">
                      ${code}
                    </span>
                  </td>
                </tr>
              </table>

              <p style="color:#64748b;font-size:12px;margin:0 0 28px;">
                Ce code expire dans 24 heures.
              </p>

              <!-- Security note -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="background:#0d1117;border-radius:10px;padding:12px 16px;font-size:12px;color:#64748b;line-height:1.6;text-align:left;">
                    Ce code est strictement personnel. Si vous n'avez pas fait cette demande, ignorez cet email.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;font-size:12px;color:#334155;">
              2025 Buzreco &middot; Tous droits reserves
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
      from: `"${process.env.SMTP_SENDER_NAME || "Buzreco"}" <${process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USER || "contact@aide-multimedia.fr"}>`,
      to: email,
      subject: "Votre code de connexion Buzreco",
      html: buildEmailHtml(code),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
