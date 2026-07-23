import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import { isAtLeastAge } from "@/lib/age";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIRET_RE = /^\d{14}$/;
const NAF_RE = /^\d{2}\.\d{2}[A-Z]$/;
const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

async function generateCompanyAlias() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = `#${Array.from({ length: 6 }, () => ALIAS_CHARS[Math.floor(Math.random() * ALIAS_CHARS.length)]).join("")}`;
    const { data, error } = await supabaseAdmin.from("companies").select("id").eq("alias", alias).maybeSingle();
    if (error) throw error;
    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias entreprise unique.");
}

function confirmationEmail(firstName: string, sponsorName: string, confirmLink: string) {
  const safeFirstName = escapeHtml(firstName);
  const safeSponsorName = escapeHtml(sponsorName);
  const safeLink = escapeHtml(confirmLink);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F0F2F4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;"><tr><td style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:4px 4px 0 0;">&nbsp;</td></tr><tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;"><img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio"></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#2D3436;font-size:20px;font-weight:bold;text-align:center;line-height:1.4;">Finalisez votre compte Winelio</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:14px;line-height:1.6;">Bonjour ${safeFirstName},<br><br>${safeSponsorName} vous a ajouté à son réseau Winelio. Confirmez votre adresse e-mail, puis choisissez personnellement votre mot de passe pour activer votre compte.</td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0"><tr><td><a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;padding:14px 28px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;">Confirmer et créer mon mot de passe →</a></td></tr></table></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:12px;color:#636E72;font-size:12px;line-height:1.5;">Votre mot de passe n’a pas été choisi par votre parrain. Vous seul le créerez après cette validation.</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:11px;line-height:1.5;word-break:break-all;">Si le bouton ne fonctionne pas : <a href="${safeLink}" style="color:#FF6B35;">${safeLink}</a></td></tr></table></td></tr><tr><td style="text-align:center;padding:24px 0 0;color:#B2BAC0;font-size:11px;line-height:1.6;">© 2026 Winelio<br><span style="color:#FF6B35;font-weight:bold;">Recommandez. Connectez. Gagnez.</span></td></tr></table></td></tr></table></body></html>`;
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

    const body = await request.json();
    const firstName = clean(body.firstName);
    const lastName = clean(body.lastName);
    const email = clean(body.email).toLowerCase();
    const phone = clean(body.phone);
    const address = clean(body.address);
    const city = clean(body.city);
    const postalCode = clean(body.postalCode);
    const birthDate = clean(body.birthDate);
    const isPro = body.isPro === true;
    const companyName = clean(body.companyName);
    const professionalEmail = clean(body.professionalEmail).toLowerCase();
    const siret = clean(body.siret).replace(/\s/g, "");
    const nafCode = clean(body.nafCode).toUpperCase();

    if (!firstName || !lastName || !email || !phone || !address || !city || !postalCode || !birthDate) {
      return NextResponse.json({ error: "Tous les champs personnels sont obligatoires." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    if (!isAtLeastAge(birthDate)) return NextResponse.json({ error: "Le filleul doit avoir au moins 18 ans." }, { status: 400 });
    if (isPro && (!companyName || !EMAIL_RE.test(professionalEmail) || !SIRET_RE.test(siret) || !NAF_RE.test(nafCode))) {
      return NextResponse.json({ error: "Les informations professionnelles sont incomplètes ou invalides." }, { status: 400 });
    }

    const { data: sponsor, error: sponsorError } = await supabaseAdmin
      .from("profiles").select("id, first_name, last_name, sponsor_code").eq("id", user.id).single();
    if (sponsorError || !sponsor) return NextResponse.json({ error: "Profil parrain introuvable." }, { status: 404 });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const temporaryPassword = randomBytes(48).toString("base64url");
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password: temporaryPassword,
      options: {
        redirectTo: `${appUrl}/auth/callback`,
        data: {
          app: "winelio", first_name: firstName, last_name: lastName, phone, address, city,
          postal_code: postalCode, birth_date: birthDate, terms_accepted: false,
          sponsor_id: user.id, sponsor_code: sponsor.sponsor_code,
          requires_password_setup: true, onboarding_status: PENDING_REFERRAL_STATUS,
          siret: isPro ? siret : null, naf_code: isPro ? nafCode : null,
        },
      },
    });
    if (linkError || !linkData.user?.id) {
      const duplicate = linkError?.message.toLowerCase().includes("already");
      return NextResponse.json({ error: duplicate ? "Cette adresse e-mail possède déjà un compte ou une invitation." : (linkError?.message ?? "Création impossible.") }, { status: 400 });
    }
    createdUserId = linkData.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").update({
      onboarding_status: PENDING_REFERRAL_STATUS,
      is_professional: isPro,
      terms_accepted: false,
      terms_accepted_at: null,
    }).eq("id", createdUserId);
    if (profileError) throw profileError;

    if (isPro) {
      const alias = await generateCompanyAlias();
      const { error: companyError } = await supabaseAdmin.from("companies").insert({
        owner_id: createdUserId, name: companyName, alias, siret, siren: siret.slice(0, 9),
        email: professionalEmail, phone, address, city, postal_code: postalCode,
        country: "FR", naf_code: nafCode, source: "owner",
      });
      if (companyError) throw companyError;
    }

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) throw new Error("Jeton de confirmation introuvable.");
    const confirmLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup&setup_password=1`;
    const sponsorName = [sponsor.first_name, sponsor.last_name].filter(Boolean).join(" ") || "Votre parrain";
    const emailResult = await sendEmail({
      to: email,
      toName: `${firstName} ${lastName}`,
      subject: `${sponsorName} vous invite à rejoindre Winelio`,
      html: confirmationEmail(firstName, sponsorName, confirmLink),
    });
    if (!emailResult.ok) throw new Error("L’e-mail de confirmation n’a pas pu être envoyé.");

    return NextResponse.json({ success: true, referralId: createdUserId });
  } catch (error) {
    console.error("[network/pre-register-referral]", error);
    if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur." }, { status: 500 });
  }
}
