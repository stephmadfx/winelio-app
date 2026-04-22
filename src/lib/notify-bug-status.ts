import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

type BugStatusNotificationKind = "in_progress" | "done";

type BugStatusNotificationInput = {
  userId: string;
  reportId: string;
  firstName: string | null;
  email: string | null;
  pageUrl: string | null;
  message: string;
  kind: BugStatusNotificationKind;
};

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildBugStatusEmailHtml({
  firstName,
  reportId,
  pageUrl,
  message,
  kind,
}: {
  firstName: string;
  reportId: string;
  pageUrl: string | null;
  message: string;
  kind: BugStatusNotificationKind;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";
  const title = kind === "in_progress"
    ? "Votre demande a été prise en charge"
    : "Votre demande a été clôturée";
  const accent = kind === "in_progress" ? "#3B82F6" : "#10B981";
  const chipBg = kind === "in_progress" ? "#EFF6FF" : "#ECFDF5";
  const chipText = kind === "in_progress" ? "#1D4ED8" : "#047857";
  const shortId = reportId.substring(0, 8);
  const ctaLabel = kind === "in_progress" ? "Voir mon historique" : "Relire l'historique";

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
      ${LOGO_IMG_HTML}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="52" height="52" style="background:${accent};border-radius:13px;text-align:center;vertical-align:middle;">
          <span style="font-size:24px;">${kind === "in_progress" ? "⏳" : "✅"}</span>
        </td>
        <td style="padding-left:16px;vertical-align:middle;">
          <p style="margin:0;color:#2D3436;font-size:18px;font-weight:700;">${esc(title)}</p>
          <p style="margin:4px 0 0;color:#636E72;font-size:13px;">Réf. #${esc(shortId)} · nous restons sur le sujet jusqu'à la résolution</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:${chipBg};border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:16px 20px;">
      <tr><td>
        <p style="margin:0 0 4px;color:${chipText};font-size:11px;text-transform:uppercase;letter-spacing:1px;">Statut</p>
        <p style="margin:0;color:#2D3436;font-size:14px;line-height:1.6;">${kind === "in_progress"
          ? "Notre équipe a bien pris en charge votre demande. On analyse le point remonté et on garde l'historique sous surveillance."
          : "La correction ou la modification est terminée. Vous pouvez relire l'historique si besoin, et nous écrire si quelque chose vous semble encore bloquant."}</p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:10px;padding:0;">
        <a href="${esc(appUrl)}/dashboard?bugHistory=1"
           style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-weight:700;font-size:14px;">
          ${esc(ctaLabel)} →
        </a>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-right:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Bonjour</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(firstName || "Membre")}</p>
        </td>
        <td style="width:50%;padding-left:8px;vertical-align:top;">
          <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Page</p>
          <p style="margin:0;color:#2D3436;font-size:13px;">${esc(pageUrl || "/")}</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
      <tr><td>
        <p style="margin:0 0 4px;color:#636E72;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Votre message</p>
        <p style="margin:0;color:#2D3436;font-size:14px;line-height:1.6;">${esc(message)}</p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#F0F2F4;font-size:0;">&nbsp;</td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

    <p style="margin:0;color:#B2BAC0;font-size:11px;text-align:center;">
      © 2026 <span style="color:#FF6B35;font-weight:600;">Winelio</span> — Merci pour votre retour.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function enqueueBugStatusEmail(input: BugStatusNotificationInput) {
  if (!input.email) {
    console.error(`[bug-status-email] Email introuvable pour userId=${input.userId}`);
    return false;
  }

  const subject =
    input.kind === "in_progress"
      ? `Winelio — Votre demande est prise en charge`
      : `Winelio — Votre demande est clôturée`;

  const { error } = await supabaseAdmin.schema("winelio").from("email_queue").insert({
    to_email: input.email,
    to_name: input.firstName ?? null,
    subject,
    html: buildBugStatusEmailHtml({
      firstName: input.firstName ?? "Membre",
      reportId: input.reportId,
      pageUrl: input.pageUrl,
      message: input.message,
      kind: input.kind,
    }),
    text:
      input.kind === "in_progress"
        ? `Bonjour ${input.firstName ?? "Membre"},\n\nVotre demande Winelio a été prise en charge. Notre équipe est dessus.\n\nRéf. #${input.reportId.substring(0, 8)}\nPage : ${input.pageUrl ?? "/"}\n\n© 2026 Winelio`
        : `Bonjour ${input.firstName ?? "Membre"},\n\nVotre demande Winelio a été clôturée.\n\nRéf. #${input.reportId.substring(0, 8)}\nPage : ${input.pageUrl ?? "/"}\n\n© 2026 Winelio`,
    reply_to: "support@winelio.app",
    priority: 5,
    scheduled_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[bug-status-email] Queue insert error:", error.message);
    return false;
  }

  return true;
}

export async function notifyBugStatusChange(input: BugStatusNotificationInput) {
  return enqueueBugStatusEmail(input);
}
