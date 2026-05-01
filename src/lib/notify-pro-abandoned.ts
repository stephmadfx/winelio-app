// src/lib/notify-pro-abandoned.ts
// Email envoyé au referrer après que le pro a ignoré 3 relances consécutives.
// Ton mesuré, pas de blame du pro.
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function notifyProAbandoned(recommendationId: string): Promise<void> {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id,
       referrer:profiles!recommendations_referrer_id_fkey(email, first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(companies(name)),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const referrer = normalize<{ email: string | null; first_name: string | null; last_name: string | null }>(rec.referrer);
  const pro = normalize<{ companies: unknown }>(rec.professional);
  const company = normalize<{ name: string | null }>(pro?.companies);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  if (!referrer?.email) return;

  const referrerFirstName = referrer.first_name || "";
  const proName = company?.name || "Le professionnel";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "votre contact";
  const ctaUrl = `${SITE_URL}/recommendations/${recommendationId}`;

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Le pro n'a pas donné suite</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">😞</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Votre recommandation n'avance plus</h1></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${referrerFirstName ? `Bonjour ${he(referrerFirstName)},` : "Bonjour,"}</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(proName)}</strong> n'a pas répondu à plusieurs relances concernant votre recommandation pour <strong style="color:#2D3436;">${he(contactName)}</strong>.</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Vous pouvez reprendre la main et la transférer à un autre pro depuis votre tableau de bord.</p></td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir ma recommandation →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await queueEmail({
    to:      referrer.email,
    toName:  referrerFirstName || undefined,
    subject: `${proName} n'a pas donné suite à votre recommandation`,
    html,
  });
}
