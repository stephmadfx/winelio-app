/**
 * Envoie un email au professionnel qui reçoit une nouvelle recommandation.
 * Deux templates distincts selon que le pro est enregistré sur Winelio (owner)
 * ou simplement scrappé d'une base externe (scraped).
 *
 * Ordre de priorité pour l'adresse destinataire :
 *   1. companies.email (donnée scrapée ou saisie par le pro)
 *   2. profiles.email  (si compte utilisateur existant)
 */
import { queueEmail } from "@/lib/email-queue";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { pickActiveCompany } from "@/lib/pick-active-company";
import { formatDisplayName } from "@/lib/utils";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.app").replace(/\/$/, "");
const trackClick = (rid: string) => `${SITE_URL}/api/email-track/click?rid=${encodeURIComponent(rid)}`;
const trackOpen = (rid: string) => `${SITE_URL}/api/email-track/open?rid=${encodeURIComponent(rid)}`;

type Urgency = "urgent" | "normal" | "flexible" | string | null;

function urgencyLabel(u: Urgency): string {
  if (u === "urgent") return "Urgent";
  if (u === "flexible") return "Flexible";
  return "Normal";
}

/** Template destiné aux pros déjà inscrits sur Winelio (source='owner') */
function buildOwnerEmail(proFirstName: string, referrerName: string, contactName: string, projectDescription: string, urgency: string, recommendationId: string): string {
  const ctaUrl = trackClick(recommendationId);
  const pixelUrl = trackOpen(recommendationId);
  const greeting = proFirstName ? `Bonjour <strong style="color:#2D3436;">${he(proFirstName)}</strong>,` : "Bonjour,";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Nouvelle recommandation Winelio</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">✨</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Nouvelle recommandation&nbsp;!</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${greeting}</p></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;"><strong style="color:#2D3436;">${he(referrerName)}</strong> vous recommande pour un projet&nbsp;!</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${he(contactName)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Urgence</p>
            <p style="margin:0 0 12px;color:#636E72;font-size:14px;">${he(urgency)}</p>
            <p style="margin:0 0 8px;color:#2D3436;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Projet</p>
            <p style="margin:0;color:#636E72;font-size:14px;line-height:1.5;">${he(projectDescription)}</p>
          </td></tr>
          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#B2BAC0;font-size:12px;line-height:1.5;">Acceptez rapidement pour lancer la mise en relation.</p></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />
</body></html>`;
}

/** Template destiné aux pros simplement scrappés (source='scraped'), qui ne connaissent pas Winelio */
function buildScrapedEmail(companyName: string, referrerName: string, contactName: string, projectDescription: string, urgency: string, recommendationId: string): string {
  const ctaUrl = trackClick(recommendationId);
  const pixelUrl = trackOpen(recommendationId);
  const optOutUrl = `mailto:contact@winelio.app?subject=Opposition%20ou%20modification%20de%20fiche%20professionnelle&body=Bonjour%20l%27%C3%A9quipe%20Winelio%2C%0A%0AJe%20souhaite%20modifier%20ou%20supprimer%20ma%20fiche%20professionnelle%20associ%C3%A9e%20%C3%A0%20l%27entreprise%20${encodeURIComponent(companyName)}%20(Recommandation%20ID%20%3A%20${encodeURIComponent(recommendationId)}).%0A%0ACordialement.`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Votre activité a été recommandée sur Winelio</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <!-- Barre accent -->
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <!-- Carte Blanche -->
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <!-- Logo -->
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Emoji / Titre -->
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🎉</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Bonne nouvelle&nbsp;!</h1></td></tr>
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Message principal -->
          <tr><td style="color:#636E72;font-size:15px;line-height:1.6;text-align:left;">
            Bonjour,<br/><br/>
            Votre activité a récemment été recommandée sur Winelio par l'un de nos utilisateurs.<br/><br/>
            <strong>Une opportunité de mise en relation vous attend.</strong><br/><br/>
            Pour consulter cette recommandation et accéder aux informations associées, nous vous invitons à activer gratuitement votre espace professionnel.
          </td></tr>
          
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Bouton CTA principal -->
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td align="center" style="border-radius:12px;mso-padding-alt:0px;">
                  <a href="${ctaUrl}"
                     target="_blank"
                     rel="noopener noreferrer"
                     style="display:block;padding:14px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;background:#FF6B35;background:linear-gradient(135deg,#FF6B35,#F7931E);mso-padding-alt:0;line-height:1.4;"
                  >
                    ACTIVER MON ESPACE PROFESSIONNEL &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td></tr>
          
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Avantages de l'activation -->
          <tr><td style="color:#636E72;font-size:14px;line-height:1.6;text-align:left;">
            L'activation de votre compte vous permettra notamment de :<br/>
            • Consulter les recommandations reçues ;<br/>
            • Accepter ou refuser les mises en relation ;<br/>
            • Développer votre activité grâce au réseau Winelio ;<br/>
            • Accéder aux fonctionnalités réservées aux professionnels.
          </td></tr>
          
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Encadré Projet (donne de la crédibilité en montrant qu'il y a un vrai projet derrière) -->
          <tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:16px 20px;border-radius:4px;">
            <p style="margin:0 0 6px;color:#2D3436;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Aperçu du besoin client</p>
            <p style="margin:0 0 10px;color:#636E72;font-size:14px;line-height:1.5;">${he(projectDescription)}</p>
            <p style="margin:0 0 4px;color:#2D3436;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Ville / Zone géographique</p>
            <p style="margin:0;color:#636E72;font-size:14px;">${he(contactName)}</p>
          </td></tr>

          <tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Pourquoi cet email / Mentions légales obligatoires -->
          <tr><td style="border-top:1px solid #F0F2F4;padding-top:20px;color:#8B949E;font-size:12px;line-height:1.6;text-align:left;">
            <strong style="color:#2D3436;font-size:13px;display:block;margin-bottom:6px;">Pourquoi recevez-vous cet email ?</strong>
            Votre activité professionnelle a été référencée dans Winelio à partir d'informations professionnelles publiquement accessibles afin de permettre sa recommandation par les utilisateurs de la plateforme.<br/><br/>
            Vous n'êtes actuellement pas inscrit sur Winelio et aucune obligation ne vous engage. L'activation de votre compte reste entièrement facultative.<br/><br/>
            Conformément à la réglementation applicable, vous pouvez à tout moment demander la modification ou la suppression de votre fiche professionnelle.<br/><br/>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <a href="${optOutUrl}"
                     style="display:inline-block;color:#FF6B35;font-weight:bold;text-decoration:underline;"
                  >
                    👉 MODIFIER OU SUPPRIMER MA FICHE
                  </a>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          
          <!-- Footer de signature -->
          <tr><td style="color:#636E72;font-size:14px;line-height:1.5;text-align:left;">
            Pour toute question : <a href="mailto:contact@winelio.app" style="color:#FF6B35;text-decoration:none;">contact@winelio.app</a><br/><br/>
            L'équipe Winelio
          </td></tr>
        </table>
      </td></tr>
      
      <!-- Footer de l'email -->
      <tr><td align="center" style="padding:24px 0;">
        <p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · La plateforme française de recommandations</p>
        <p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p>
      </td></tr>
    </table>
  </td></tr></table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />
</body></html>`;
}

export async function notifyNewRecommendation(recommendationId: string) {
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, referrer_id, project_description, urgency_level,
       professional:profiles!recommendations_professional_id_fkey(id, first_name, email, companies(name, email, source, deleted_at)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name),
       contact:contacts(first_name, last_name, city)`
    )
    .eq("id", recommendationId)
    .single();

  if (!rec) return;

  const normalize = <T,>(v: unknown): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v as T | null));
  const pro = normalize<{
    id: string;
    first_name: string | null;
    email: string | null;
    companies: unknown;
  }>(rec.professional);
  const referrer = normalize<{ first_name: string | null; last_name: string | null }>(rec.referrer);
  const contact = normalize<{ first_name: string | null; last_name: string | null; city: string | null }>(rec.contact);

  if (!pro) return;

  const company = pickActiveCompany<{ name: string | null; email: string | null; source: string | null; deleted_at: string | null }>(pro.companies);

  // Collecter les adresses valides. On ignore les emails factices (@kiparlo-pro.fr).
  const isPlaceholderEmail = (e: string | null) => !!e && /@kiparlo-pro\.fr$/i.test(e);
  const companyMailValid = company?.email && !isPlaceholderEmail(company.email) ? company.email : null;
  const profileMailValid = pro.email && !isPlaceholderEmail(pro.email) ? pro.email : null;

  // Envoyer aux deux si différents, sinon au seul disponible.
  const recipients = [...new Set([companyMailValid, profileMailValid].filter(Boolean) as string[])];
  if (recipients.length === 0) return;

  const referrerName = formatDisplayName(referrer?.first_name, referrer?.last_name, "Un membre Winelio");
  const contactName = (() => {
    const f = contact?.first_name?.trim() || "";
    const l = contact?.last_name?.trim() || "";
    const c = contact?.city?.trim() || "";
    const fDisplay = f.length > 10 ? f.slice(0, 10) + "..." : f;
    let name = fDisplay;
    if (fDisplay && l) {
      name += ` ${l.charAt(0).toUpperCase()}.`;
    } else if (l) {
      name = `${l.charAt(0).toUpperCase()}.`;
    }
    if (!name) name = "Un contact";
    if (c) name += ` (${c})`;
    return name;
  })();
  const urgency = urgencyLabel(rec.urgency_level);
  const isScraped = company?.source === "scraped";

  const shortenCompanyName = (name: string | null | undefined): string => {
    if (!name) return "votre entreprise";
    const trimmed = name.trim();
    if (trimmed.length > 10) {
      return trimmed.slice(0, 10) + "...";
    }
    return trimmed;
  };

  const shortCompanyName = shortenCompanyName(company?.name);

  const subject = isScraped
    ? `Votre activité a été recommandée sur Winelio !`
    : `Nouvelle recommandation de ${referrerName}`;

  for (const to of recipients) {
    const html = isScraped
      ? buildScrapedEmail(company?.name || "votre entreprise", referrerName, contactName, rec.project_description || "", urgency, recommendationId)
      : buildOwnerEmail(pro.first_name || "", referrerName, contactName, rec.project_description || "", urgency, recommendationId);
    await queueEmail({ to, subject, html });
  }

  // Notifie aussi la chaîne de parrains du referrer (niveaux 1-5)
  if (rec.referrer_id) {
    await notifyReferrerSponsorChain(
      rec.referrer_id as string,
      referrer?.first_name ?? null,
      referrer?.last_name ?? null,
      rec.project_description || "",
    ).catch((e) => console.error("[notify-reco] sponsor chain error:", e));
  }
}

// ─────────────────────────────────────────────────────────────────
// Notification de la chaîne de parrains du referrer
// ─────────────────────────────────────────────────────────────────

type ChainEntry = { name: string; level: number };

function fmtSponsorName(first: string | null, last: string | null): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const f = first ? cap(first) : null;
  const i = last ? last.charAt(0).toUpperCase() : null;
  return [f, i].filter(Boolean).join(". ");
}

function chainHtml(chain: ChainEntry[]): string {
  if (!chain.length) return "";
  const rows = chain.map((e) => {
    const label = e.level === 1 ? "parrain direct" : `niveau&nbsp;${e.level}`;
    return `<tr><td style="padding:3px 0;color:#636E72;font-size:13px;line-height:1.6;">
      &bull;&nbsp;<strong style="color:#2D3436;">${he(e.name)}</strong>
      <span style="color:#B2BAC0;font-size:12px;">&nbsp;(${label})</span>
    </td></tr>`;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
    <tr><td style="color:#636E72;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;padding-bottom:4px;">Chaîne de parrainage</td></tr>
    ${rows}
  </table>`;
}

function chainText(chain: ChainEntry[]): string {
  if (!chain.length) return "";
  return [
    "Chaîne de parrainage :",
    ...chain.map((e) => `  • ${e.name} (${e.level === 1 ? "parrain direct" : `niveau ${e.level}`})`),
  ].join("\n");
}

function buildSponsorRecoEmail(
  recipientFirstName: string,
  referrerName: string,
  projectDescription: string,
  level: number,
  chain: ChainEntry[],
): string {
  const levelColor = level === 1 ? "#FF6B35" : "#F7931E";
  const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.app").replace(/\/$/, "");

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Nouvelle recommandation dans votre réseau</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="52" height="52" style="background:#FFF5F0;border-radius:13px;text-align:center;vertical-align:middle;font-size:26px;line-height:52px;">📋</td>
          </tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;line-height:1.3;">Nouvelle recommandation<br/>dans votre réseau !</h1></td></tr>
          <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;">Bonjour <strong style="color:#2D3436;">${he(recipientFirstName)}</strong>,</p></td></tr>
          <tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td>
            <div style="background:#F8F9FA;border-radius:12px;padding:20px 24px;">
              <p style="margin:0;color:#2D3436;font-size:15px;line-height:1.6;">
                <strong style="color:${levelColor};">${he(referrerName)}</strong>
                vient de faire une recommandation en tant que
                ${level === 1 ? "votre filleul direct" : `membre de votre réseau (niveau&nbsp;${level})`}.
              </p>
              ${projectDescription ? `<p style="margin:12px 0 0;color:#636E72;font-size:13px;line-height:1.6;">
                <strong style="color:#2D3436;">Projet :</strong> ${he(projectDescription)}
              </p>` : ""}
              ${level > 1 ? chainHtml(chain) : ""}
            </div>
          </td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background:${levelColor};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;padding:6px 20px;border-radius:20px;text-transform:uppercase;">
                Niveau ${level}
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
              <a href="${SITE_URL}/network" style="display:inline-block;color:#fff;font-size:15px;font-weight:700;padding:15px 36px;border-radius:12px;text-decoration:none;">
                Voir mon réseau →
              </a>
            </td>
          </tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;">
        <p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio · Plateforme de recommandation professionnelle</p>
        <p style="margin:4px 0 0;color:#FF6B35;font-size:11px;font-weight:600;">Recommandez. Connectez. Gagnez.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function notifyReferrerSponsorChain(
  referrerId: string,
  referrerFirstName: string | null,
  referrerLastName: string | null,
  projectDescription: string,
): Promise<void> {
  // Remonte la chaîne de parrains du referrer jusqu'à 5 niveaux
  const chain: Array<{ id: string; level: number }> = [];
  let currentId = referrerId;

  for (let level = 1; level <= 5; level++) {
    const { data: p } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();
    if (!p?.sponsor_id) break;
    chain.push({ id: p.sponsor_id, level });
    currentId = p.sponsor_id;
  }

  if (chain.length === 0) return;

  const sponsorIds = chain.map((s) => s.id);
  const [profilesRes, authRes] = await Promise.all([
    supabaseAdmin.schema("winelio").from("profiles").select("id, first_name, last_name").in("id", sponsorIds),
    Promise.all(sponsorIds.map((id) => supabaseAdmin.auth.admin.getUserById(id))),
  ]);

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, { firstName: p.first_name as string | null, lastName: p.last_name as string | null }])
  );
  const emailMap = new Map(
    sponsorIds.map((id, i) => [id, authRes[i].data?.user?.email ?? null])
  );

  const referrerFullName = [referrerFirstName, referrerLastName].filter(Boolean).join(" ") || "Un membre";
  const referrerShortName = referrerFirstName
    ? [
        referrerFirstName.charAt(0).toUpperCase() + referrerFirstName.slice(1).toLowerCase(),
        referrerLastName ? `${referrerLastName.charAt(0).toUpperCase()}.` : null,
      ].filter(Boolean).join(" ")
    : "Un membre";

  const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://winelio.app").replace(/\/$/, "");

  for (const { id, level } of chain) {
    const email = emailMap.get(id);
    if (!email || email.endsWith("@winelio-demo.internal") || email.endsWith("@winelio-pro.fr")) continue;

    const recipientProfile = profileMap.get(id);
    const recipientFirstName = recipientProfile?.firstName || "Membre";
    const displayName = level === 1 ? referrerFullName : referrerShortName;

    // Chaîne intermédiaire : niveaux 1 à level-1
    const intermediaries: ChainEntry[] = chain
      .filter((s) => s.level < level)
      .map((s) => {
        const p = profileMap.get(s.id);
        return { name: fmtSponsorName(p?.firstName ?? null, p?.lastName ?? null), level: s.level };
      });

    const textChain = chainText(intermediaries);
    const textBody = [
      `Bonjour ${recipientFirstName},`,
      "",
      `${displayName} vient de faire une recommandation en tant que ${level === 1 ? "votre filleul direct" : `membre niveau ${level}`} dans votre réseau.`,
      ...(projectDescription ? ["", `Projet : ${projectDescription}`] : []),
      ...(textChain ? ["", textChain] : []),
      "",
      `Voir mon réseau : ${SITE_URL}/network`,
      "",
      "---",
      "© 2026 Winelio · Recommandez. Connectez. Gagnez.",
    ].join("\n");

    await queueEmail({
      to: email,
      subject: level === 1
        ? `${referrerFullName} a fait une nouvelle recommandation Winelio`
        : `Nouvelle recommandation niveau ${level} dans votre réseau Winelio`,
      html: buildSponsorRecoEmail(recipientFirstName, displayName, projectDescription, level, intermediaries),
      text: textBody,
      priority: level === 1 ? 4 : 8,
    });
  }
}
