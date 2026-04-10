import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";

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

const SEND_MAIL_TIMEOUT_MS = 10000;

async function sendMailWithTimeout(message: Parameters<typeof transporter.sendMail>[0]) {
  return Promise.race([
    transporter.sendMail(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SMTP timeout")), SEND_MAIL_TIMEOUT_MS)
    ),
  ]);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const message = formData.get("message") as string | null;
  const screenshot = formData.get("screenshot") as File | null;
  const pageUrl = (formData.get("pageUrl") as string | null) ?? "/";

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message requis" }, { status: 400 });
  }

  const reportId = crypto.randomUUID();
  let screenshotStoragePath: string | null = null;
  let screenshotSignedUrl: string | null = null;

  if (screenshot && screenshot.size > 0) {
    if (screenshot.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Screenshot trop volumineux (max 5 Mo)" }, { status: 413 });
    }
    const bytes = await screenshot.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const extMap: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/gif": "gif" };
    const ext = extMap[screenshot.type] ?? "png";
    const path = `${user.id}/${reportId}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("bug-screenshots")
      .upload(path, buffer, { contentType: screenshot.type, upsert: false });

    if (!uploadError) {
      screenshotStoragePath = path;
      const { data: signed } = await supabaseAdmin.storage
        .from("bug-screenshots")
        .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 jours
      screenshotSignedUrl = signed?.signedUrl ?? null;
    } else {
      console.error("[bug/report] Storage upload error:", uploadError);
    }
  }

  const { error: dbError } = await supabaseAdmin
    .from("bug_reports")
    .insert({
      id: reportId,
      user_id: user.id,
      message: message.trim(),
      screenshot_url: screenshotStoragePath,
      page_url: pageUrl,
    });

  if (dbError) {
    console.error("[bug/report] DB error:", dbError);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  // Envoi email support
  try {
    await sendMailWithTimeout({
      from: `"Winelio Support" <${process.env.SMTP_USER || "support@winelio.app"}>`,
      to: "support@winelio.app",
      replyTo: "support@winelio.app",
      subject: `[Bug #${reportId}] Signalement - ${pageUrl}`,
      html: buildBugEmailHtml(reportId, user.email ?? "", message.trim(), pageUrl, screenshotSignedUrl),
    });
  } catch (err) {
    console.error("[bug/report] SMTP error:", err);
    // Ne pas bloquer la réponse si l'email échoue
  }

  return NextResponse.json({ success: true, id: reportId });
}

function buildBugEmailHtml(
  reportId: string,
  userEmail: string,
  message: string,
  pageUrl: string,
  screenshotUrl: string | null
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const shortId = reportId.substring(0, 8);
  const screenshotHtml = screenshotUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
       <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;">
         <a href="${screenshotUrl}" style="display:inline-block;background:#FFF5F0;border:1px solid #FF6B35;border-radius:8px;padding:10px 20px;color:#FF6B35;font-size:13px;text-decoration:none;">
           Voir le screenshot →
         </a>
       </td></tr></table>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
  <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
    <p style="text-align:center;margin:0 0 24px;">
      <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio" />
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;">
          <span style="font-size:24px;">🐛</span>
        </td>
        <td style="padding-left:16px;vertical-align:middle;">
          <p style="margin:0;color:#2D3436;font-size:18px;font-weight:700;">Nouveau signalement de bug</p>
          <p style="margin:4px 0 0;color:#636E72;font-size:13px;">Réf. #${esc(shortId)}</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
      <tr><td>
        <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Message</p>
        <p style="margin:0;color:#2D3436;font-size:14px;line-height:1.6;">${esc(message)}</p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-right:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Utilisateur</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(userEmail)}</p>
        </td>
        <td style="width:50%;padding-left:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Page</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(pageUrl)}</p>
        </td>
      </tr>
    </table>

    ${screenshotHtml}

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <p style="margin:0;color:#B2BAC0;font-size:11px;text-align:center;">
      © 2026 <span style="color:#FF6B35;font-weight:600;">Winelio</span> — Répondez directement à cet email pour contacter le bêta-testeur.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
