import { COMMISSION_TYPE } from "@/lib/constants";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";
import { he } from "@/lib/html-escape";
import { supabaseAdmin } from "@/lib/supabase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr>
        <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
            <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:24px;">&nbsp;</td></tr>
            <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
          ${content}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:24px;">
          <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p>
          <p style="color:#FF6B35;font-size:11px;margin:0;">Recommandez. Connectez. Gagnez.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
            <a href="${url.replace(/"/g, "&quot;")}" style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">${label}</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

function buildCreditedEmail(firstName: string, clientName: string, amount: number): string {
  const amountStr = amount.toFixed(2).replace(".", ",");
  const walletUrl = `${APP_URL}/wallet`;

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;color:#ffffff;font-size:26px;font-weight:800;line-height:52px;text-align:center;vertical-align:middle;">€</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Votre cagnotte a été créditée</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(firstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
        <p style="margin:0;color:#2D3436;font-size:15px;font-weight:600;">Client : ${he(clientName)}</p>
        <p style="margin:8px 0 0;color:#636E72;font-size:14px;line-height:1.6;">Le professionnel a réglé sa commission d'intermédiation Winelio.</p>
        <p style="margin:12px 0 0;color:#FF6B35;font-size:24px;font-weight:800;">+${amountStr}&nbsp;€</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:14px;line-height:1.6;text-align:center;margin:0 0 20px;">
      Le montant est maintenant visible dans votre wallet Winelio.
    </p>
    ${ctaButton("Voir ma cagnotte →", walletUrl)}`;

  return emailShell(content);
}

export async function notifyReferrerCommissionCredited(
  recommendationId: string
): Promise<void> {
  const { data: rec } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id, contact:contacts(first_name, last_name)")
    .eq("id", recommendationId)
    .single();

  if (!rec?.referrer_id) return;

  const { data: commission } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount")
    .eq("recommendation_id", recommendationId)
    .eq("user_id", rec.referrer_id)
    .eq("type", COMMISSION_TYPE.RECOMMENDATION)
    .eq("status", "EARNED")
    .maybeSingle();

  if (!commission?.amount) return;

  const [profileResult, authResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("first_name")
      .eq("id", rec.referrer_id)
      .single(),
    supabaseAdmin.auth.admin.getUserById(rec.referrer_id),
  ]);

  const email = authResult.data?.user?.email;
  if (!email) {
    console.error(
      `[notify-commission-credited] Email introuvable pour referrerId=${rec.referrer_id}`
    );
    return;
  }

  const contact = normalizeOne<{
    first_name?: string | null;
    last_name?: string | null;
  }>(rec.contact);
  const clientName =
    `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
    "votre client";
  const firstName = profileResult.data?.first_name || "Membre";
  const amount = Number(commission.amount);

  await queueEmail({
    to: email,
    subject: `Cagnotte créditée — +${amount.toFixed(2).replace(".", ",")} €`,
    html: buildCreditedEmail(firstName, clientName, amount),
    text: `Bonjour ${firstName},\n\nLe professionnel a réglé sa commission d'intermédiation Winelio pour ${clientName}. Votre cagnotte a été créditée de ${amount.toFixed(2)} €.\n\nVoir votre wallet : ${APP_URL}/wallet\n\n© 2026 Winelio`,
    priority: 4,
    dedupeKey: `commission-credited:${recommendationId}:${rec.referrer_id}`,
  });
}
