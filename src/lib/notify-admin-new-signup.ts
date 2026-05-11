/**
 * Notification admin envoyée à chaque NOUVELLE inscription réelle.
 * Destinataire unique : contact@aide-multimedia.fr.
 *
 * Mise en queue avec priority = 10 (bulk / basse priorité) pour ne jamais
 * ralentir les emails métier (OTP, recommandations, commissions).
 *
 * À appeler depuis verify-code APRÈS l'assignation du parrain, sinon le
 * sponsor ne sera pas encore connu pour les inscriptions sans code parrain
 * (assignation auto à un fondateur).
 */
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const ADMIN_EMAIL = "contact@aide-multimedia.fr";

type SponsorRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  sponsor_code: string | null;
};

function fullName(first?: string | null, last?: string | null): string {
  const value = `${first ?? ""} ${last ?? ""}`.trim();
  return value || "Sans nom";
}

export async function notifyAdminNewSignup(newUserId: string): Promise<void> {
  const { data: profile, error } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("id, email, first_name, last_name, sponsor_id, sponsor_code, created_at")
    .eq("id", newUserId)
    .single();

  if (error || !profile) {
    console.error("[notify-admin-new-signup] profil introuvable", newUserId, error?.message);
    return;
  }

  let sponsor: SponsorRow | null = null;
  if (profile.sponsor_id) {
    const { data: sponsorRow } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("id, email, first_name, last_name, sponsor_code")
      .eq("id", profile.sponsor_id)
      .single<SponsorRow>();
    sponsor = sponsorRow ?? null;
  }

  const newName = fullName(profile.first_name, profile.last_name);
  const newEmail = profile.email ?? "(email inconnu)";
  const sponsorName = sponsor ? fullName(sponsor.first_name, sponsor.last_name) : "Aucun parrain";
  const sponsorEmail = sponsor?.email ?? "—";
  const sponsorCode = sponsor?.sponsor_code ?? "—";
  const signupCode = profile.sponsor_code ?? "—";
  const signupDate = new Date(profile.created_at ?? Date.now()).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "short",
  });

  const subject = `[Winelio] Nouvelle inscription : ${newName}`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${he(subject)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="height:4px;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:4px 4px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:20px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:26px;color:#ffffff;">🎉</td></tr>
            </table>
          </td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="text-align:center;color:#1F2937;font-size:20px;font-weight:700;line-height:1.3;">Nouvelle inscription Winelio</td></tr>
          <tr><td style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="text-align:center;color:#6B7280;font-size:13px;line-height:1.5;">${he(signupDate)}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:6px;padding:16px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="color:#9CA3AF;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Nouvel inscrit</td></tr>
              <tr><td style="color:#1F2937;font-size:16px;font-weight:600;padding-bottom:2px;">${he(newName)}</td></tr>
              <tr><td style="color:#4B5563;font-size:13px;padding-bottom:6px;"><a href="mailto:${he(newEmail)}" style="color:#FF6B35;text-decoration:none;">${he(newEmail)}</a></td></tr>
              <tr><td style="color:#9CA3AF;font-size:12px;">Code parrain attribué : <strong style="color:#1F2937;">${he(signupCode)}</strong></td></tr>
            </table>
          </td></tr>
          <tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#F8FAFC;border-radius:6px;padding:16px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="color:#9CA3AF;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding-bottom:4px;">Parrain</td></tr>
              <tr><td style="color:#1F2937;font-size:15px;font-weight:600;padding-bottom:2px;">${he(sponsorName)}</td></tr>
              <tr><td style="color:#4B5563;font-size:13px;padding-bottom:6px;">${he(sponsorEmail)}</td></tr>
              <tr><td style="color:#9CA3AF;font-size:12px;">Code parrain utilisé : <strong style="color:#1F2937;">${he(sponsorCode)}</strong></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="text-align:center;color:#B2BAC0;font-size:11px;">© 2026 Winelio · <span style="color:#FF6B35;">Recommandez. Connectez. Gagnez.</span></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    "Nouvelle inscription Winelio",
    "",
    `Date : ${signupDate}`,
    "",
    "— Nouvel inscrit —",
    `Nom : ${newName}`,
    `Email : ${newEmail}`,
    `Code parrain attribué : ${signupCode}`,
    "",
    "— Parrain —",
    `Nom : ${sponsorName}`,
    `Email : ${sponsorEmail}`,
    `Code parrain : ${sponsorCode}`,
  ].join("\n");

  await queueEmail({
    to: ADMIN_EMAIL,
    subject,
    html,
    text,
    priority: 10,
  });
}
