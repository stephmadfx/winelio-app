import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { pickActiveCompany } from "@/lib/pick-active-company";
import { formatDisplayName } from "@/lib/utils";

/**
 * Email au client (contact) quand le pro accepte la recommandation (étape 2).
 * Premier contact Winelio → client : on explique l'origine de la recommandation
 * (RGPD) et on donne les coordonnées du pro qui va le contacter.
 *
 * N'est envoyé que si le pro a réellement accès au lead, c'est-à-dire une carte
 * bancaire enregistrée (sinon les coordonnées du client lui sont masquées).
 * Sans carte au moment de l'acceptation, l'envoi est rejoué par
 * POST /api/stripe/payment-method dès que la carte est enregistrée.
 */
export async function notifyContactAccepted(recommendationId: string) {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id,
       contact:contacts(first_name, last_name, email),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, email, phone, stripe_payment_method_id, companies(name, deleted_at))`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const contact  = normalize<{ first_name: string | null; last_name: string | null; email: string | null }>(rec.contact);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const pro      = normalize<{ first_name: string | null; last_name: string | null; email: string | null; phone: string | null; stripe_payment_method_id: string | null; companies: unknown }>(rec.professional);
  const company  = pickActiveCompany<{ name: string | null; deleted_at: string | null }>(pro?.companies);

  if (!contact?.email) return;

  // Pas de carte enregistrée = pas d'accès réel au lead → on n'annonce pas
  // au client qu'il va être contacté.
  if (!pro?.stripe_payment_method_id) return;

  const contactFirst = contact.first_name || "Bonjour";
  const referrerName = formatDisplayName(referrer?.first_name, referrer?.last_name, "Une personne de votre entourage");
  const proName      = formatDisplayName(pro?.first_name, pro?.last_name, "Un professionnel");
  const companyName  = company?.name || null;
  const proDisplay   = companyName ? `${proName} (${companyName})` : proName;

  const proContactLines = [
    pro?.email ? `📧 ${he(pro.email)}` : null,
    pro?.phone ? `📞 ${he(pro.phone)}` : null,
  ].filter(Boolean);

  const subject = `${proDisplay} va vous contacter pour votre projet`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${he(subject)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🤝</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Bonne nouvelle pour votre projet !</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(contactFirst)}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(referrerName)}</strong> vous a recommandé un professionnel via <strong style="color:#FF6B35;">Winelio</strong>.<br><br><strong style="color:#2D3436;">${he(proDisplay)}</strong> a accepté de prendre en charge votre projet et va vous contacter très prochainement.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          ${proContactLines.length > 0 ? `<tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;"><p style="margin:0;color:#636E72;font-size:14px;line-height:1.8;">Vous pouvez aussi le joindre directement :<br><strong style="color:#2D3436;">${proContactLines.join("<br>")}</strong></p></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>` : ""}
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:13px;line-height:1.6;">Vous recevez cet email car ${he(referrerName)} a communiqué vos coordonnées à Winelio dans le cadre de cette mise en relation.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await queueEmail({
    to: contact.email,
    toName: formatDisplayName(contact.first_name, contact.last_name, "") || undefined,
    subject,
    html,
    dedupeKey: `recommendation:${recommendationId}:step:2:contact`,
  });
}
