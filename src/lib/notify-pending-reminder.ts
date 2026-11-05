// Relance au pro : une recommandation reçue est restée PENDING (aucun changement de statut).
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { pickActiveCompany } from "@/lib/pick-active-company";
import { formatDisplayName, formatMaskedProspectName } from "@/lib/utils";
import { reminderRecipients, signReminderToken } from "@/lib/pending-reminder";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

const norm = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T | null));

/** Retourne true si au moins un email a été mis en file. */
export async function notifyPendingReminder(recommendationId: string): Promise<boolean> {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id,
       professional:profiles!recommendations_professional_id_fkey(email, companies(name, email, source, deleted_at)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name, city)`
    )
    .eq("id", recommendationId)
    .single();
  if (!rec) return false;

  const pro = norm<{ email: string | null; companies: unknown }>(rec.professional);
  const company = pickActiveCompany<{ name: string | null; email: string | null; source: string | null; deleted_at: string | null }>(pro?.companies);
  const referrer = norm<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = norm<{ first_name: string | null; last_name: string | null; city: string | null }>(rec.contact);

  const recipients = reminderRecipients(pro?.email ?? null, company);
  if (recipients.length === 0) return false;

  const referrerName = formatDisplayName(referrer?.first_name, referrer?.last_name, "Un membre Winelio");
  const contactName = formatMaskedProspectName(contact?.first_name, contact?.last_name, contact?.city, "un client");

  const token = encodeURIComponent(signReminderToken(recommendationId));
  const viewUrl = `${SITE_URL}/api/email-track/click?rid=${encodeURIComponent(recommendationId)}`;
  const cancelUrl = `${SITE_URL}/recommendations/reminder/${token}/cancel`;
  const unsubUrl = `${SITE_URL}/recommendations/reminder/${token}/unsubscribe`;

  const sp = (h: number) => `<tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Une recommandation vous attend</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          ${sp(24)}
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🔔</td></tr></table></td></tr>
          ${sp(16)}
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Une recommandation vous attend</h1></td></tr>
          ${sp(12)}
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour,</p></td></tr>
          ${sp(12)}
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(referrerName)}</strong> vous a recommandé auprès de <strong style="color:#2D3436;">${he(contactName)}</strong> il y a quelque temps, et nous n'avons pas eu de nouvelles de votre part.</p></td></tr>
          ${sp(28)}
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${viewUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
          ${sp(24)}
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.8;text-align:center;">Ce n'est pas le bon moment ?<br>
              <a href="${cancelUrl}" style="color:#FF6B35;">Annuler cette recommandation</a><br>
              <a href="${unsubUrl}" style="color:#FF6B35;">Ne plus recevoir ces rappels</a><br>
              <a href="${SITE_URL}" style="color:#FF6B35;">Découvrir Winelio</a></p>
          </td></tr>
          ${sp(16)}
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;line-height:1.5;">Ce rappel est envoyé une seule fois pour cette recommandation.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · Recommandez, gagnez</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const subject = `Rappel : ${referrerName} vous a recommandé sur Winelio`;
  let queued = false;
  for (const to of recipients) {
    // dedupeKey : un retry du cron ne peut jamais renvoyer le même mail.
    await queueEmail({ to, subject, html, dedupeKey: `pending-reminder:${recommendationId}:${to.toLowerCase()}` });
    queued = true;
  }
  return queued;
}
