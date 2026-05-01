// src/lib/notify-pro-followup.ts
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { signFollowupToken } from "@/lib/followup-token";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

type AfterStep = 2 | 4 | 5;
type CycleIndex = 1 | 2 | 3;

const SUBJECT_BY_STEP: Record<AfterStep, string> = {
  2: "Avez-vous pris contact avec votre client ?",
  4: "Avez-vous transmis le devis à votre client ?",
  5: "Vos travaux sont-ils terminés ?",
};

const QUESTION_BY_STEP: Record<AfterStep, (contact: string) => string> = {
  2: (c) => `Avez-vous bien pris contact avec <strong style="color:#2D3436;">${c}</strong> ?`,
  4: (c) => `Avez-vous transmis le devis à <strong style="color:#2D3436;">${c}</strong> ?`,
  5: (c) => `Les travaux pour <strong style="color:#2D3436;">${c}</strong> sont-ils terminés et le paiement reçu ?`,
};

const SUBJECT_OVERRIDE_BY_CYCLE: Record<CycleIndex, ((base: string) => string) | null> = {
  1: null,
  2: () => "Toujours intéressé par cette recommandation ?",
  3: () => "Dernière relance — votre client attend une réponse",
};

const ICON_BY_CYCLE: Record<CycleIndex, string> = { 1: "🔔", 2: "⏰", 3: "⚠️" };

const H1_BY_CYCLE: Record<CycleIndex, (subject: string) => string> = {
  1: (s) => s,
  2: () => "Toujours intéressé par cette recommandation&nbsp;?",
  3: () => "Dernière relance avant abandon",
};

interface FollowupContext {
  followupId: string;
  recommendationId: string;
  afterStep: AfterStep;
  cycleIndex: CycleIndex;
}

export async function notifyProFollowup(ctx: FollowupContext): Promise<string | null> {
  const { followupId, recommendationId, afterStep, cycleIndex } = ctx;

  // Charger toutes les données nécessaires
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, project_description, created_at,
       professional:profiles!recommendations_professional_id_fkey(
         first_name, email, companies(name, email)
       ),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return null;

  const normalize = <T,>(v: unknown): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v as T | null);

  const pro = normalize<{ first_name: string | null; email: string | null; companies: unknown }>(rec.professional);
  const company = normalize<{ name: string | null; email: string | null }>(pro?.companies);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null }>(rec.contact);

  // Email destinataire : email pro perso si dispo, sinon email company
  const recipientEmail = pro?.email || company?.email || null;
  if (!recipientEmail) return null;

  const proFirstName = pro?.first_name || "";
  const referrerName = [referrer?.first_name, referrer?.last_name].filter(Boolean).join(" ") || "Un membre Winelio";
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "votre client";
  const companyName = company?.name || "votre entreprise";

  const baseSubject = SUBJECT_BY_STEP[afterStep];
  const subject = SUBJECT_OVERRIDE_BY_CYCLE[cycleIndex]?.(baseSubject) ?? baseSubject;
  const h1 = H1_BY_CYCLE[cycleIndex](baseSubject);
  const icon = ICON_BY_CYCLE[cycleIndex];
  const question = QUESTION_BY_STEP[afterStep](he(contactName));

  const token = signFollowupToken(followupId);
  const doneUrl = `${SITE_URL}/api/recommendations/followup-action?token=${encodeURIComponent(token)}&action=done`;
  const postponeUrl = `${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/postpone`;
  const abandonUrl = `${SITE_URL}/recommendations/followup/${encodeURIComponent(token)}/abandon`;

  const projectExcerpt = (rec.project_description ?? "").slice(0, 140);
  const greeting = proFirstName ? `Bonjour ${he(proFirstName)},` : "Bonjour,";
  const createdMs = rec.created_at ? new Date(rec.created_at).getTime() : Date.now();
  const acceptedDaysAgo = Math.max(1, Math.round((Date.now() - createdMs) / 86_400_000));

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
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">${icon}</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">${h1}</h1></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${greeting}</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${he(referrerName)} a recommandé <strong style="color:#2D3436;">${he(companyName)}</strong> à ${he(contactName)} il y a ${acceptedDaysAgo} jour${acceptedDaysAgo > 1 ? "s" : ""}.</p></td></tr>
          ${projectExcerpt ? `<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td><p style="margin:0;color:#B2BAC0;font-size:13px;font-style:italic;line-height:1.6;">« ${he(projectExcerpt)}${(rec.project_description ?? "").length > 140 ? "…" : ""} »</p></td></tr>` : ""}
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td><p style="margin:0;color:#2D3436;font-size:16px;line-height:1.6;font-weight:600;">${question}</p></td></tr>
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:14px 18px;border-radius:4px;">
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.6;">💡 Si c'est fait, marquez-le en 1 clic. Sinon, dites-nous quand vous serez en mesure de le faire.</p>
          </td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td><a href="${doneUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">✅ C'est fait</a></td>
                <td width="12" style="font-size:0;line-height:0;">&nbsp;</td>
                <td><a href="${postponeUrl}" style="display:inline-block;background:#FFFFFF;color:#FF6B35;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;border:2px solid #FF6B35;">📅 Reporter</a></td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><a href="${abandonUrl}" style="color:#B2BAC0;font-size:13px;text-decoration:underline;">Je ne peux pas donner suite</a></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return await queueEmail({
    to:      recipientEmail,
    toName:  proFirstName || undefined,
    subject,
    html,
    priority: cycleIndex === 3 ? 3 : 5,
  });
}
