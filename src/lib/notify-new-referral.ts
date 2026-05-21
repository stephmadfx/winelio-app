/**
 * Notifie toute la chaîne de parrainage (jusqu'à 5 niveaux) qu'un nouveau
 * filleul vient de rejoindre. Appelable depuis n'importe quelle route serveur.
 *
 * Règle d'affichage :
 *   - Niveau 1 (parrain direct) : nom complet du filleul, pas de chaîne.
 *   - Niveau 2+ : Prénom + initiale du nom, + chaîne des parrains intermédiaires
 *                 (niveaux 1 à L-1) affichée en liste à puces.
 */
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.fr";

type ChainEntry = { name: string; level: number };

/** "Marie D." — prénom capitalisé + initiale du nom */
function formatSponsorName(firstName: string | null, lastName: string | null): string {
  const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const first = firstName ? capFirst(firstName) : null;
  const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : null;
  return [first, lastInitial].filter(Boolean).join(". ");
}

/** Liste à puces HTML des parrains intermédiaires */
function buildChainHtml(chain: ChainEntry[]): string {
  if (chain.length === 0) return "";
  const rows = chain.map((e) => {
    const label = e.level === 1 ? "parrain direct" : `niveau&nbsp;${e.level}`;
    return `<tr><td style="padding:3px 0;color:#636E72;font-size:13px;line-height:1.6;">
      &bull;&nbsp;<strong style="color:#2D3436;">${he(e.name)}</strong>
      <span style="color:#B2BAC0;font-size:12px;">&nbsp;(${label})</span>
    </td></tr>`;
  }).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
      <tr><td style="color:#636E72;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:6px;">
        Chaîne de parrainage
      </td></tr>
      ${rows}
    </table>`;
}

/** Version texte brut de la chaîne */
function buildChainText(chain: ChainEntry[]): string {
  if (chain.length === 0) return "";
  return [
    "Chaîne de parrainage :",
    ...chain.map((e) => {
      const label = e.level === 1 ? "parrain direct" : `niveau ${e.level}`;
      return `  • ${e.name} (${label})`;
    }),
  ].join("\n");
}

function buildReferralEmail(
  recipientFirstName: string,
  newMemberName: string,
  level: number,
  chain: ChainEntry[],
): string {
  const levelLabel =
    level === 1
      ? "votre filleul direct"
      : `un membre de votre réseau (niveau&nbsp;${level})`;
  const levelColor = level === 1 ? "#FF6B35" : "#F7931E";
  const emoji      = level === 1 ? "🎉" : "🌱";
  const iconBg     = level === 1 ? "#FFF5F0" : "#FFF8EE";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau membre dans votre réseau !</title>
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
                <tr><td align="center" style="padding-bottom:6px;">${LOGO_IMG_HTML}</td></tr>
                <tr><td style="border-bottom:1px solid #F0F2F4;font-size:0;line-height:0;padding-bottom:28px;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="width:52px;height:52px;background:${iconBg};border-radius:13px;font-size:26px;line-height:52px;text-align:center;vertical-align:middle;">
                          ${emoji}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center">
                    <h1 style="color:#2D3436;font-size:22px;font-weight:700;margin:0;line-height:1.3;">
                      Nouveau membre dans votre réseau !
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

              <!-- Bloc info -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
                    <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                      <strong style="color:${levelColor};">${he(newMemberName)}</strong>
                      vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.
                    </p>
                    ${level === 1 ? `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      En tant que parrain direct, vous bénéficierez d'une commission sur chaque recommandation validée de ce nouveau membre.
                    </p>` : `
                    <p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                      Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau&nbsp;${level}.
                    </p>
                    ${buildChainHtml(chain)}`}
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Badge niveau -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:${levelColor};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 20px;border-radius:20px;text-transform:uppercase;text-align:center;">
                          Niveau ${level}
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
                          <a href="${SITE_URL}/network"
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

export async function notifyNewReferral(newUserId: string): Promise<number> {
  const { data: newProfile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", newUserId)
    .single();

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const newMemberFullName =
    [newProfile?.first_name, newProfile?.last_name].filter(Boolean).join(" ") ||
    "Un nouveau membre";
  const newMemberShortName = newProfile?.first_name
    ? [
        cap(newProfile.first_name),
        newProfile.last_name ? `${newProfile.last_name.charAt(0).toUpperCase()}.` : null,
      ].filter(Boolean).join(" ")
    : "Un nouveau membre";

  // Remonte la chaîne jusqu'à 5 niveaux
  const sponsorChain: Array<{ id: string; level: number }> = [];
  let currentId = newUserId;

  for (let level = 1; level <= 5; level++) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();
    if (!profile?.sponsor_id) break;
    sponsorChain.push({ id: profile.sponsor_id, level });
    currentId = profile.sponsor_id;
  }

  if (sponsorChain.length === 0) return 0;

  const sponsorIds = sponsorChain.map((s) => s.id);

  const [profilesResult, authResults] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", sponsorIds),
    Promise.all(sponsorIds.map((id) => supabaseAdmin.auth.admin.getUserById(id))),
  ]);

  const profileMap = new Map(
    (profilesResult.data ?? []).map((p) => [
      p.id,
      { firstName: p.first_name as string | null, lastName: p.last_name as string | null },
    ])
  );
  const emailMap = new Map(
    sponsorIds.map((id, i) => [id, authResults[i].data?.user?.email ?? null])
  );

  const notifications: Array<{ email: string; firstName: string; level: number }> = [];
  for (const { id, level } of sponsorChain) {
    const email = emailMap.get(id);
    if (!email || email.endsWith("@winelio-pro.fr") || email.endsWith("@winelio-demo.internal")) continue;
    notifications.push({ email, firstName: profileMap.get(id)?.firstName || "Membre", level });
  }

  for (const { email, firstName, level } of notifications) {
    const memberName = level === 1 ? newMemberFullName : newMemberShortName;
    const levelLabel = level === 1 ? "filleul direct" : `membre niveau ${level}`;

    // Chaîne des parrains intermédiaires (niveaux 1 à level-1)
    const chain: ChainEntry[] = sponsorChain
      .filter((s) => s.level < level)
      .map((s) => {
        const p = profileMap.get(s.id);
        return { name: formatSponsorName(p?.firstName ?? null, p?.lastName ?? null), level: s.level };
      });

    const chainText = buildChainText(chain);

    const textBody = [
      `Bonjour ${firstName},`,
      "",
      `${memberName} vient de rejoindre Winelio en tant que ${levelLabel} dans votre réseau.`,
      "",
      level === 1
        ? "En tant que parrain direct, vous bénéficierez d'une commission sur chaque recommandation validée de ce nouveau membre."
        : `Votre réseau grandit ! Vous percevrez une commission sur les recommandations validées au niveau ${level}.`,
      ...(chainText ? ["", chainText] : []),
      "",
      `Voir mon réseau : ${SITE_URL}/network`,
      "",
      "---",
      "© 2026 Winelio · Recommandez. Connectez. Gagnez.",
    ].join("\n");

    await queueEmail({
      to: email,
      subject:
        level === 1
          ? `${newMemberFullName} a rejoint votre réseau Winelio`
          : `Nouveau membre niveau ${level} dans votre réseau Winelio`,
      html: buildReferralEmail(firstName, memberName, level, chain),
      text: textBody,
      priority: level === 1 ? 3 : 7,
    });
  }

  return notifications.length;
}
