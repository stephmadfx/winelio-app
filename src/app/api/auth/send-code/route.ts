import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 8000,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

const SEND_MAIL_TIMEOUT_MS = 10000;

async function sendMailWithTimeout(message: Parameters<typeof transporter.sendMail>[0]) {
  return Promise.race([
    transporter.sendMail(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SMTP timeout")), SEND_MAIL_TIMEOUT_MS)
    ),
  ]);
}

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
  <tr><td style="background:#FF6B35;height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:32px 40px;">
    <p style="text-align:center;margin:0 0 24px;">${LOGO_IMG_HTML}</p>
    <h1 style="color:#2D3436;font-size:20px;text-align:center;margin:0 0 8px;">Votre code de connexion</h1>
    <p style="color:#636E72;font-size:14px;text-align:center;margin:0 0 28px;">
      Saisissez ce code pour acceder a votre compte Winelio.
    </p>
    <p style="text-align:center;margin:0 0 28px;">
      <span style="display:inline-block;background:#FFF5F0;border:2px solid #FF6B35;border-radius:12px;padding:16px 40px;font-size:36px;font-weight:800;letter-spacing:10px;color:#2D3436;font-family:'Courier New',monospace;">
        ${code}
      </span>
    </p>
    <p style="color:#636E72;font-size:12px;text-align:center;margin:0 0 24px;">
      Ce code est valable <strong style="color:#2D3436;">24 heures</strong> et a usage unique.
    </p>
    <p style="color:#999;font-size:11px;text-align:center;margin:0;border-top:1px solid #F0F2F4;padding-top:16px;">
      Si vous n'avez pas fait cette demande, ignorez cet email.
    </p>
  </td></tr>
  <tr><td style="text-align:center;padding:16px 0;">
    <p style="color:#B2BAC0;font-size:11px;margin:0;">© 2026 Winelio · Recommandez. Connectez. Gagnez.</p>
  </td></tr>
</table>
</td></tr>
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
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    // Store code in Supabase (upsert → replace existing code for same email, reset attempts)
    const { error: dbError } = await supabaseAdmin
      .from("otp_codes")
      .upsert({ email, code, expires_at: expiresAt, attempts: 0 }, { onConflict: "email" });

    if (dbError) {
      console.error("send-code DB error:", dbError?.code, dbError?.message);
      return NextResponse.json(
        { error: "Erreur serveur. Réessayez." },
        { status: 500 }
      );
    }

    // Send custom email (text + html pour éviter les filtres spam)
    await sendMailWithTimeout({
      from: `"${process.env.SMTP_SENDER_NAME || "Winelio"}" <${process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USER || "support@winelio.app"}>`,
      to: email,
      subject: "Votre code de connexion Winelio",
      text: `Votre code de connexion Winelio : ${code}\n\nCe code est valable 24 heures et a usage unique.\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\n---\n© 2026 Winelio · Recommandez. Connectez. Gagnez.`,
      html: buildEmailHtml(code),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-code error:", err);
    return NextResponse.json({ error: "Envoi du code temporairement indisponible. Réessayez." }, { status: 504 });
  }
}
