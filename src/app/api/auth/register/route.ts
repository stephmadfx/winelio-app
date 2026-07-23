import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import {
  normalizePhoneNumber,
  PHONE_ALREADY_ACTIVE_MESSAGE,
  PHONE_INVALID_MESSAGE,
} from "@/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

async function generateCompanyAlias(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const alias = `#${Array.from(
      { length: 6 },
      () => ALIAS_CHARS[Math.floor(Math.random() * ALIAS_CHARS.length)]
    ).join("")}`;
    const { data, error } = await supabaseAdmin
      .schema("winelio")
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();

    if (error) throw error;
    if (!data) return alias;
  }

  throw new Error("Impossible de générer un alias entreprise unique.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, phone, address, city, postalCode, birthDate, termsAccepted, sponsorCode, sponsorId, siret, nafCode, companyName, professionalEmail, isPro = false } = body;
    const personalEmail = clean(email).toLowerCase();
    const passwordValue = clean(password);
    const firstNameValue = clean(firstName);
    const lastNameValue = clean(lastName);
    const phoneValue = clean(phone);
    const addressValue = clean(address);
    const cityValue = clean(city);
    const postalCodeValue = clean(postalCode);
    const birthDateValue = clean(birthDate);
    const companyNameValue = clean(companyName);
    const companyEmail = clean(professionalEmail).toLowerCase();
    const siretValue = clean(siret).replace(/\s/g, "");
    const nafCodeValue = clean(nafCode).toUpperCase();
    const isProRegistration = isPro === true;
    const normalizedPhone = normalizePhoneNumber(phoneValue);
    const safeFirstName = escapeHtml(firstNameValue);

    if (!personalEmail || passwordValue.length < 8 || !firstNameValue || !lastNameValue || !phoneValue || !addressValue || !cityValue || !postalCodeValue || !birthDateValue) {
      return NextResponse.json(
        { error: "Tous les champs requis doivent être remplis." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(personalEmail)) {
      return NextResponse.json({ error: "Adresse e-mail personnelle invalide." }, { status: 400 });
    }
    if (!normalizedPhone) {
      return NextResponse.json({ error: PHONE_INVALID_MESSAGE }, { status: 400 });
    }
    if (
      isProRegistration &&
      (!companyNameValue || !siretValue || !nafCodeValue || !EMAIL_RE.test(companyEmail))
    ) {
      return NextResponse.json(
        { error: "Les informations de l’entreprise et son e-mail professionnel sont obligatoires." },
        { status: 400 }
      );
    }

    const { data: accountWithPhone, error: phoneLookupError } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("id")
      .eq("phone_normalized", normalizedPhone)
      .maybeSingle();
    if (phoneLookupError) {
      console.error("[auth/register] Vérification du téléphone impossible:", phoneLookupError.code);
      return NextResponse.json({ error: "Impossible de vérifier ce numéro de téléphone." }, { status: 500 });
    }
    if (accountWithPhone) {
      return NextResponse.json({ error: PHONE_ALREADY_ACTIVE_MESSAGE }, { status: 409 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const redirectTo = `${appUrl}/auth/callback`;

    // 1. Appeler generateLink pour créer le compte et obtenir le lien de confirmation
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: personalEmail,
      password: passwordValue,
      options: {
        redirectTo,
        data: {
          app: "winelio",
          first_name: firstNameValue,
          last_name: lastNameValue,
          phone: normalizedPhone,
          address: addressValue,
          city: cityValue,
          postal_code: postalCodeValue,
          birth_date: birthDateValue,
          terms_accepted: termsAccepted === true,
          sponsor_id: sponsorId || null,
          sponsor_code: sponsorCode || null,
          siret: siretValue || null,
          naf_code: nafCodeValue || null,
        },
      },
    });

    if (linkError) {
      const { data: conflictingPhone } = await supabaseAdmin
        .schema("winelio")
        .from("profiles")
        .select("id")
        .eq("phone_normalized", normalizedPhone)
        .maybeSingle();
      if (conflictingPhone) {
        return NextResponse.json({ error: PHONE_ALREADY_ACTIVE_MESSAGE }, { status: 409 });
      }
      let errorMessage = linkError.message;
      if (
        errorMessage.toLowerCase().includes("already been registered") ||
        errorMessage.toLowerCase().includes("already exists")
      ) {
        errorMessage = "Un utilisateur avec cette adresse e-mail est déjà inscrit.";
      }
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // 1.2 Initialiser le profil et l'entreprise pour le professionnel si applicable
    const userId = linkData?.user?.id;
    if (userId && isProRegistration) {
      try {
        const alias = await generateCompanyAlias();

        // Créer la fiche entreprise dans companies avant d'activer le statut pro.
        const { error: companyError } = await supabaseAdmin
          .schema("winelio")
          .from("companies")
          .insert({
            owner_id: userId,
            name: companyNameValue,
            alias,
            siret: siretValue,
            siren: siretValue.slice(0, 9),
            email: companyEmail,
            phone: normalizedPhone,
            address: addressValue,
            city: cityValue,
            postal_code: postalCodeValue,
            country: "FR",
            naf_code: nafCodeValue,
            source: "owner",
          });

        if (companyError) throw companyError;

        const { error: profileError } = await supabaseAdmin
          .schema("winelio")
          .from("profiles")
          .update({ is_professional: true })
          .eq("id", userId);

        if (profileError) throw profileError;
      } catch (professionalSetupError) {
        console.error("[auth/register] Initialisation professionnelle impossible:", professionalSetupError);
        const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (rollbackError) {
          console.error("[auth/register] Nettoyage du compte incomplet:", rollbackError);
        }
        return NextResponse.json(
          { error: "Impossible de créer la fiche entreprise. Veuillez réessayer." },
          { status: 500 }
        );
      }
    }

    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) {
      return NextResponse.json(
        { error: "Impossible de générer le jeton de confirmation." },
        { status: 500 }
      );
    }

    // URL-encode le token pour neutraliser les caractères spéciaux (+, =, /)
    // qui peuvent être corrompus par les scanners de sécurité des opérateurs
    const customConfirmLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=signup`;
    // En HTML, le & dans les href doit être &amp; pour éviter que les clients mail
    // (Outlook, Apple Mail, antivirus) tronquent l'URL au niveau du &
    const htmlSafeLink = customConfirmLink.replace(/&/g, "&amp;");

    // 2. Construire l'e-mail avec la charte graphique Winelio
    const emailHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F0F2F4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <!-- Barre accent -->
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>
          <!-- Carte Blanche -->
          <tr>
            <td style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
              <!-- Logo -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">
                    <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio">
                  </td>
                </tr>
              </table>
              
              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="color:#2D3436;font-size:20px;font-weight:bold;text-align:center;line-height:1.4;">
                    Confirmez votre inscription
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="color:#636E72;font-size:14px;line-height:1.6;text-align:left;">
                    Bonjour ${safeFirstName},<br><br>
                    Merci de vous être inscrit sur Winelio. Pour valider votre compte et accéder à votre tableau de bord, veuillez cliquer sur le bouton ci-dessous :
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <!-- Button : td sans background pour éviter les problèmes de clic sur mobile -->
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="border-radius:12px;mso-padding-alt:0px;">
                          <a href="${htmlSafeLink}"
                             target="_blank"
                             rel="noopener noreferrer"
                             style="display:block;padding:14px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;background:#FF6B35;background:linear-gradient(135deg,#FF6B35,#F7931E);mso-padding-alt:0;line-height:1.4;"
                          >
                            Valider mon compte &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="color:#636E72;font-size:12px;line-height:1.6;text-align:left;border-top:1px solid #F0F2F4;padding-top:16px;">
                    Si le bouton ne fonctionne pas, copiez et collez le lien suivant dans votre navigateur :<br>
                    <a href="${htmlSafeLink}" style="color:#FF6B35;word-break:break-all;">${customConfirmLink}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding:24px 0 0 0;">
              <p style="color:#B2BAC0;font-size:11px;margin:0 0 4px;">© 2026 Winelio · Recommandez. Connectez. Gagnez.</p>
              <p style="color:#FF6B35;font-size:11px;font-weight:bold;margin:0;">Winelio</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // 3. Envoyer l'e-mail avec sendEmail
    const emailResult = await sendEmail({
      to: personalEmail,
      subject: "Confirmez votre inscription sur Winelio",
      html: emailHtml,
    });

    if (!emailResult.ok) {
      console.error("Erreur d'envoi d'e-mail d'inscription:", emailResult.error);
      // Même si l'e-mail a échoué à s'envoyer, l'utilisateur a été créé.
      // Mais on signale une erreur pour qu'il puisse retenter ou être guidé.
      return NextResponse.json(
        { error: "Le compte a été créé mais l'e-mail de confirmation n'a pas pu être envoyé." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("Erreur dans l'API de register:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
