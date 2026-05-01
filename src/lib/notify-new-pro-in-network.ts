/**
 * Notifie UNIQUEMENT le parrain niveau 1 d'un utilisateur quand celui-ci
 * vient de compléter sa fiche professionnelle (passage de filleul à pro).
 * Inclut la photo de profil du nouveau pro si elle existe.
 */
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { resolveProfileAvatarUrl, getProfileInitials } from "@/lib/profile-avatar";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Distanciel",
  onsite: "Présentiel",
  both: "Distanciel & Présentiel",
};

function buildAvatarBlock(avatarUrl: string | null, displayName: string): string {
  if (avatarUrl) {
    return `
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="width:88px;height:88px;border-radius:44px;background:linear-gradient(135deg,#FF6B35,#F7931E);padding:3px;">
            <img src="${he(avatarUrl)}" alt="${he(displayName)}" width="82" height="82" style="display:block;border:0;border-radius:41px;width:82px;height:82px;object-fit:cover;background:#ffffff;" />
          </td>
        </tr>
      </table>`;
  }
  const initials = getProfileInitials(displayName);
  return `
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="width:88px;height:88px;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:44px;color:#ffffff;font-size:28px;font-weight:700;line-height:88px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          ${he(initials)}
        </td>
      </tr>
    </table>`;
}

function buildEmail(params: {
  recipientFirstName: string;
  proName: string;
  avatarUrl: string | null;
  categoryName: string;
  workModeLabel: string;
  city: string | null;
}): string {
  const { recipientFirstName, proName, avatarUrl, categoryName, workModeLabel, city } = params;
  const networkUrl = `${SITE_URL}/network`;
  const avatarBlock = buildAvatarBlock(avatarUrl, proName);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Un pro vient de rejoindre votre réseau</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <span style="font-size:11px;color:#FF6B35;font-weight:600;letter-spacing:1px;">Recommandez. Connectez. Gagnez.</span>
                  </td>
                </tr>
                <tr>
                  <td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">${avatarBlock}</td>
                </tr>
                <tr><td style="height:18px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Un pro vient de rejoindre votre réseau !
                    </h1>
                  </td>
                </tr>
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <p style="color:#636E72;font-size:15px;margin:0;">
                      Bonjour <strong style="color:#2D3436;">${he(recipientFirstName)}</strong>,
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#FFF5F0;border-left:3px solid #FF6B35;border-radius:0 12px 12px 0;padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#FF6B35;text-transform:uppercase;letter-spacing:1px;">Filleul direct devenu pro</p>
                    <p style="margin:0 0 12px;color:#2D3436;font-size:16px;font-weight:700;line-height:1.4;">
                      ${he(proName)}
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #FFE8DC;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Catégorie</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(categoryName)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;${city ? "border-bottom:1px solid #FFE8DC;" : ""}">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Mode de travail</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(workModeLabel)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${city ? `
                      <tr>
                        <td style="padding:6px 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:13px;color:#636E72;width:40%;">Ville</td>
                              <td style="font-size:13px;color:#2D3436;font-weight:600;">${he(city)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="32" style="vertical-align:top;padding-top:2px;">
                          <span style="font-size:18px;">💡</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:top;">
                          <p style="margin:0;font-size:13px;color:#636E72;line-height:1.6;">
                            Vous touchez désormais <strong style="color:#2D3436;">1% d'affiliation</strong> sur chaque recommandation validée pour ce professionnel.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${networkUrl}"
                             style="display:inline-block;color:#ffffff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                            Voir mon réseau →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="color:#B2BAC0;font-size:12px;margin:0 0 4px;">
                © 2026 Winelio · Plateforme de recommandation professionnelle
              </p>
              <p style="color:#FF6B35;font-size:11px;margin:0;">
                Recommandez. Connectez. Gagnez.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Notifie le parrain direct (niveau 1) qu'un de ses filleuls vient
 * d'activer sa fiche professionnelle. Aucun envoi vers les niveaux > 1.
 *
 * @param newProUserId — id du user qui vient de devenir pro
 * @param meta — infos sur la fiche (categoryName, workMode) pour enrichir l'email
 */
export async function notifyNewProInNetwork(
  newProUserId: string,
  meta: { categoryName?: string | null; workMode?: string | null } = {}
): Promise<boolean> {
  const { data: newPro } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, avatar, city, sponsor_id")
    .eq("id", newProUserId)
    .single();

  if (!newPro?.sponsor_id) return false;

  const { data: sponsorProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name")
    .eq("id", newPro.sponsor_id)
    .single();

  const { data: sponsorAuth } = await supabaseAdmin.auth.admin.getUserById(newPro.sponsor_id);
  const sponsorEmail = sponsorAuth?.user?.email ?? null;

  if (!sponsorEmail) return false;
  if (sponsorEmail.endsWith("@winelio-pro.fr") || sponsorEmail.endsWith("@winelio-demo.internal")) return false;

  const proName =
    [newPro.first_name, newPro.last_name].filter(Boolean).join(" ") || "Un nouveau pro";
  const recipientFirstName = sponsorProfile?.first_name || "Membre";
  const avatarUrl = resolveProfileAvatarUrl(newPro.avatar ?? null);
  const categoryName = meta.categoryName?.trim() || "—";
  const workModeLabel = meta.workMode ? WORK_MODE_LABELS[meta.workMode] ?? meta.workMode : "—";
  const city = newPro.city?.trim() || null;

  const html = buildEmail({
    recipientFirstName,
    proName,
    avatarUrl,
    categoryName,
    workModeLabel,
    city,
  });

  const text = [
    `Bonjour ${recipientFirstName},`,
    "",
    `${proName} vient de compléter sa fiche professionnelle Winelio.`,
    `Catégorie : ${categoryName}`,
    `Mode de travail : ${workModeLabel}`,
    city ? `Ville : ${city}` : null,
    "",
    "Vous touchez désormais 1% d'affiliation sur chaque recommandation validée pour ce professionnel.",
    "",
    `Voir mon réseau : ${SITE_URL}/network`,
    "",
    "---",
    "© 2026 Winelio · Recommandez. Connectez. Gagnez.",
  ]
    .filter(Boolean)
    .join("\n");

  await queueEmail({
    to: sponsorEmail,
    subject: `${proName} a activé sa fiche pro dans votre réseau Winelio`,
    html,
    text,
    priority: 3,
  });

  return true;
}
