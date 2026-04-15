import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { queueEmail } from "@/lib/email-queue";

// ─── Helpers HTML ─────────────────────────────────────────────────────────────

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

function infoBlock(content: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 8px 8px 0;padding:16px 20px;">
      ${content}
    </td></tr>
  </table>`;
}

// ─── Email 1 : Lien de paiement (J+0) ─────────────────────────────────────────

function buildPaymentLinkEmail(
  proFirstName: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): string {
  const amountStr = amount.toFixed(2).replace(".", ",");
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">💳</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Commission à régler</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    ${infoBlock(`
      <p style="margin:0;color:#2D3436;font-size:15px;font-weight:600;">Client : ${he(clientName)}</p>
      <p style="margin:8px 0 0;color:#636E72;font-size:14px;">Le paiement de votre client a été confirmé. Voici la commission Winelio à régler :</p>
      <p style="margin:12px 0 0;color:#FF6B35;font-size:24px;font-weight:800;">${amountStr}&nbsp;€</p>
    `)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:13px;text-align:center;margin:0 0 20px;">
      Ce lien est valable <strong style="color:#2D3436;">24 heures</strong>. Un rappel vous sera envoyé si nécessaire.
    </p>
    ${ctaButton("Payer ma commission →", checkoutUrl)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#999;font-size:11px;text-align:center;margin:0;">
      Des questions ? Contactez-nous à <a href="mailto:support@winelio.app" style="color:#FF6B35;">support@winelio.app</a>
    </p>`;

  return emailShell(content);
}

// ─── Email 2 : Relance (J+2) ───────────────────────────────────────────────────

function buildReminderEmail(
  proFirstName: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): string {
  const amountStr = amount.toFixed(2).replace(".", ",");
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:#FFF5F0;border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">⏰</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Rappel — Commission en attente</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    ${infoBlock(`
      <p style="margin:0;color:#2D3436;font-size:15px;font-weight:600;">Client : ${he(clientName)}</p>
      <p style="margin:8px 0 0;color:#636E72;font-size:14px;">Votre commission Winelio n'a pas encore été réglée.</p>
      <p style="margin:12px 0 0;color:#FF6B35;font-size:24px;font-weight:800;">${amountStr}&nbsp;€</p>
    `)}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:13px;text-align:center;margin:0 0 20px;">
      Merci de procéder au règlement dès que possible pour maintenir votre accès à la plateforme.
    </p>
    ${ctaButton("Payer ma commission →", checkoutUrl)}`;

  return emailShell(content);
}

// ─── Email 3 : Alerte client + référent (J+4) ─────────────────────────────────

function buildAlertEmail(recipientFirstName: string): string {
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="width:52px;height:52px;background:#FFF5F0;border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">ℹ️</td></tr>
        </table>
      </td></tr>
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;">Information — Commission non réglée</h1></td></tr>
      <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center"><p style="color:#636E72;font-size:15px;margin:0;">Bonjour <strong style="color:#2D3436;">${he(recipientFirstName)}</strong>,</p></td></tr>
      <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Nous vous informons que la commission liée à votre dossier n'a pas encore été réglée par le professionnel concerné.
      Notre équipe prend en charge le suivi de cette situation.
    </p>
    <p style="color:#636E72;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Si vous avez des questions, n'hésitez pas à contacter notre support.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="background:#F8F9FA;border-radius:12px;padding:12px 24px;">
              <a href="mailto:support@winelio.app" style="color:#FF6B35;font-size:14px;font-weight:600;text-decoration:none;">support@winelio.app</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>`;

  return emailShell(content);
}

// ─── Fonctions exportées ───────────────────────────────────────────────────────

export async function sendCommissionPaymentEmail(
  proId: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): Promise<void> {
  const [profileResult, authResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name").eq("id", proId).single(),
    supabaseAdmin.auth.admin.getUserById(proId),
  ]);

  const firstName = profileResult.data?.first_name || "Professionnel";
  const email = authResult.data?.user?.email;
  if (!email) {
    console.error(`[notify-commission-payment] Email introuvable pour proId=${proId}`);
    return;
  }

  await queueEmail({
    to: email,
    subject: `Commission Winelio — ${clientName} — ${amount.toFixed(2).replace(".", ",")} €`,
    html: buildPaymentLinkEmail(firstName, clientName, amount, checkoutUrl),
    text: `Bonjour ${firstName},\n\nVotre commission Winelio pour le client ${clientName} est de ${amount.toFixed(2)} €.\n\nRéglez-la ici : ${checkoutUrl}\n\n© 2026 Winelio`,
    priority: 5,
  });
}

export async function sendCommissionReminderEmail(
  proId: string,
  clientName: string,
  amount: number,
  checkoutUrl: string
): Promise<void> {
  const [profileResult, authResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("first_name").eq("id", proId).single(),
    supabaseAdmin.auth.admin.getUserById(proId),
  ]);

  const firstName = profileResult.data?.first_name || "Professionnel";
  const email = authResult.data?.user?.email;
  if (!email) {
    console.error(`[notify-commission-payment] Email introuvable pour proId=${proId}`);
    return;
  }

  await queueEmail({
    to: email,
    subject: `Rappel — Commission en attente ${amount.toFixed(2).replace(".", ",")} €`,
    html: buildReminderEmail(firstName, clientName, amount, checkoutUrl),
    text: `Bonjour ${firstName},\n\nRappel : votre commission Winelio de ${amount.toFixed(2)} € pour ${clientName} n'a pas encore été réglée.\n\nLien de paiement : ${checkoutUrl}\n\n© 2026 Winelio`,
    priority: 5,
  });
}

export async function sendCommissionAlertEmails(
  contactId: string,
  referrerId: string
): Promise<void> {
  const { data: referrerProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name")
    .eq("id", referrerId)
    .single();

  const { data: contactRow } = await supabaseAdmin
    .from("contacts")
    .select("email, first_name, last_name")
    .eq("id", contactId)
    .maybeSingle();

  const referrerAuth = await supabaseAdmin.auth.admin.getUserById(referrerId);
  const referrerEmail = referrerAuth.data?.user?.email;
  const referrerFirstName = referrerProfile?.first_name || "Membre";

  const recipients: Array<{ email: string; firstName: string }> = [];

  if (contactRow?.email) {
    recipients.push({
      email: contactRow.email,
      firstName: contactRow.first_name || "Client",
    });
  }
  if (referrerEmail) {
    recipients.push({ email: referrerEmail, firstName: referrerFirstName });
  }

  await Promise.allSettled(
    recipients.map(({ email, firstName }) =>
      queueEmail({
        to: email,
        subject: "Information — Commission non réglée",
        html: buildAlertEmail(firstName),
        text: `Bonjour ${firstName},\n\nNous vous informons que la commission liée à votre dossier n'a pas encore été réglée. Notre équipe assure le suivi.\n\nContact : support@winelio.app\n\n© 2026 Winelio`,
        priority: 5,
      })
    )
  );
}
