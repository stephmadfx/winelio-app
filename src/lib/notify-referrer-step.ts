import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

type StepInfo = {
  emoji: string;
  subject: (proName: string, contactName: string) => string;
  title: (proName: string, contactName: string) => string;
  body: (proName: string, contactName: string) => string;
  highlight?: boolean; // commissions mentionnées
};

const STEP_MESSAGES: Record<number, StepInfo> = {
  2: {
    emoji: "🎉",
    subject: (pro, contact) => `${pro} a accepté votre recommandation`,
    title:   (pro) => `${he(pro)} a accepté !`,
    body:    (pro, contact) => `<strong style="color:#2D3436;">${he(pro)}</strong> a accepté votre recommandation pour <strong style="color:#2D3436;">${he(contact)}</strong> et va prendre contact prochainement.`,
  },
  3: {
    emoji: "📞",
    subject: (pro, contact) => `${pro} a contacté ${contact}`,
    title:   (pro, contact) => `Contact établi avec ${he(contact)}`,
    body:    (pro, contact) => `<strong style="color:#2D3436;">${he(pro)}</strong> a pris contact avec <strong style="color:#2D3436;">${he(contact)}</strong>. La mission avance !`,
  },
  4: {
    emoji: "📅",
    subject: (pro, contact) => `Un rendez-vous a été fixé avec ${contact}`,
    title:   () => `Rendez-vous fixé`,
    body:    (pro, contact) => `<strong style="color:#2D3436;">${he(pro)}</strong> a fixé un rendez-vous avec <strong style="color:#2D3436;">${he(contact)}</strong>. Tout se déroule parfaitement.`,
  },
  5: {
    emoji: "📄",
    subject: (pro, contact) => `${pro} a soumis un devis à ${contact}`,
    title:   () => `Devis soumis`,
    body:    (pro, contact) => `<strong style="color:#2D3436;">${he(pro)}</strong> a soumis un devis à <strong style="color:#2D3436;">${he(contact)}</strong>. Si le client l'accepte, votre commission sera calculée sur ce montant.`,
  },
  6: {
    emoji: "✅",
    subject: (pro, contact) => `Affaire conclue — vos commissions sont en route !`,
    title:   () => `Travaux terminés — affaire conclue !`,
    body:    (pro, contact) => `<strong style="color:#2D3436;">${he(pro)}</strong> a confirmé que les travaux sont terminés et que le paiement de <strong style="color:#2D3436;">${he(contact)}</strong> a été reçu.<br><br>Vos <strong style="color:#FF6B35;">commissions sont en cours de traitement</strong> et seront bientôt disponibles dans votre wallet Winelio.`,
    highlight: true,
  },
};

export async function notifyReferrerStep(recommendationId: string, stepIndex: number) {
  const info = STEP_MESSAGES[stepIndex];
  if (!info) return;

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id,
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name, email),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, companies(name)),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const referrer = normalize<{ first_name: string | null; last_name: string | null; email: string | null }>(rec.referrer);
  const pro      = normalize<{ first_name: string | null; last_name: string | null; companies: unknown }>(rec.professional);
  const company  = normalize<{ name: string | null }>(pro?.companies);
  const contact  = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  if (!referrer?.email) return;

  const proName      = company?.name || [pro?.first_name, pro?.last_name].filter(Boolean).join(" ") || "Le professionnel";
  const contactName  = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "votre contact";
  const referrerFirst = referrer.first_name || "Bonjour";
  const recoUrl      = `${SITE_URL}/recommendations/${recommendationId}`;

  const title   = info.title(proName, contactName);
  const body    = info.body(proName, contactName);
  const subject = info.subject(proName, contactName);

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">${info.emoji}</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">${title}</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(referrerFirst)}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${body}</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          ${info.highlight ? `<tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;"><p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">Retrouvez le détail de vos commissions dans votre <strong>wallet Winelio</strong> dès leur validation.</p></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>` : ""}
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${recoUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  await queueEmail({ to: referrer.email, subject, html });
}
