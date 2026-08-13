import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import { isAtLeastAge } from "@/lib/age";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";
import { buildReferralConfirmationEmail } from "@/lib/referral-confirmation-email";
import {
  normalizePhoneNumber,
  PHONE_ALREADY_ACTIVE_MESSAGE,
  PHONE_INVALID_MESSAGE,
} from "@/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIRET_RE = /^\d{14}$/;
const NAF_RE = /^\d{2}\.\d{2}[A-Z]$/;
const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    const phoneInput = clean(body.phone);
    const phone = normalizePhoneNumber(phoneInput);
    const address = clean(body.address);
    const city = clean(body.city);
    const postalCode = clean(body.postalCode);
    const birthDate = clean(body.birthDate);
    const isPro = body.isPro === true;
    const companyName = clean(body.companyName);
    const professionalEmail = clean(body.professionalEmail).toLowerCase();
    const siret = clean(body.siret).replace(/\s/g, "");
    const nafCode = clean(body.nafCode).toUpperCase();

    if (!firstName || !lastName || !email || !phoneInput || !address || !city || !postalCode || !birthDate) {
      return NextResponse.json({ error: "Tous les champs personnels sont obligatoires." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    if (!phone) return NextResponse.json({ error: PHONE_INVALID_MESSAGE }, { status: 400 });
    if (!isAtLeastAge(birthDate)) return NextResponse.json({ error: "Le filleul doit avoir au moins 18 ans." }, { status: 400 });
    if (isPro && (!companyName || !EMAIL_RE.test(professionalEmail) || !SIRET_RE.test(siret) || !NAF_RE.test(nafCode))) {
      return NextResponse.json({ error: "Les informations professionnelles sont incomplètes ou invalides." }, { status: 400 });
    }

    const { data: sponsor, error: sponsorError } = await supabaseAdmin
      .from("profiles").select("id, first_name, last_name, sponsor_code").eq("id", user.id).single();
    if (sponsorError || !sponsor) return NextResponse.json({ error: "Profil parrain introuvable." }, { status: 404 });

    const { data: accountWithPhone, error: phoneLookupError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone_normalized", phone)
      .maybeSingle();
    if (phoneLookupError) throw phoneLookupError;
    if (accountWithPhone) {
      return NextResponse.json({ error: PHONE_ALREADY_ACTIVE_MESSAGE }, { status: 409 });
    }

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
      const { data: conflictingPhone } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone_normalized", phone)
        .maybeSingle();
      if (conflictingPhone) {
        return NextResponse.json({ error: PHONE_ALREADY_ACTIVE_MESSAGE }, { status: 409 });
      }
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
      html: buildReferralConfirmationEmail(firstName, sponsorName, confirmLink),
    });
    if (!emailResult.ok) throw new Error("L’e-mail de confirmation n’a pas pu être envoyé.");

    const nextReminderAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error: reminderError } = await supabaseAdmin.schema("winelio")
      .from("pending_account_reminders")
      .upsert({
        user_id: createdUserId,
        reminder_count: 0,
        next_reminder_at: nextReminderAt,
        status: "pending",
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (reminderError) throw reminderError;

    return NextResponse.json({ success: true, referralId: createdUserId });
  } catch (error) {
    console.error("[network/pre-register-referral]", error);
    if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur." }, { status: 500 });
  }
}
