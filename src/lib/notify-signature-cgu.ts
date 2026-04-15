import nodemailer from "nodemailer";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const smtpPort = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: smtpPort,
  secure: smtpPort === 465,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 8000,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

export async function sendSignatureConfirmationEmail(params: {
  to: string;
  firstName: string;
  pdfBuffer: Buffer;
  signedAt: Date;
}): Promise<void> {
  const dateStr = params.signedAt.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = buildConfirmationHtml(params.firstName, dateStr);

  await transporter.sendMail({
    from: `"Winelio" <${process.env.SMTP_USER || "support@winelio.app"}>`,
    to: params.to,
    subject: "Vos CGU Agents Immobiliers — exemplaire signé",
    html,
    attachments: [
      {
        filename: `cgu-agents-immobiliers-${params.signedAt.toISOString().slice(0, 10)}.pdf`,
        content: params.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

function buildConfirmationHtml(firstName: string, dateStr: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.winelio.com";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">
        ${LOGO_IMG_HTML}
      </td></tr>
      <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td>
        <h1 style="color:#2D3436;font-size:22px;margin:0 0 16px;">Signature confirmée</h1>
        <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Bonjour ${escapeHtml(firstName)},
        </p>
        <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Vous avez signé les <strong style="color:#2D3436;">CGU Agents Immobiliers Winelio</strong> le ${escapeHtml(dateStr)}.
          Un exemplaire certifié est joint à cet email.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:10px;padding:0;">
            <a href="${escapeHtml(appUrl)}/dashboard"
               style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-weight:700;font-size:14px;">
              Accéder à mon espace →
            </a>
          </td></tr>
        </table>
        <p style="color:#B2BAC0;font-size:11px;margin:0;">
          Conservez cet email et la pièce jointe comme preuve de votre engagement contractuel.
        </p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="text-align:center;padding:16px 0;">
    <p style="color:#B2BAC0;font-size:11px;margin:0 0 4px;">© 2026 Winelio</p>
    <p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
