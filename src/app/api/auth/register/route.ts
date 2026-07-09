import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName, phone, sponsorCode, sponsorId } = body;

    if (!email || !password || !firstName || !lastName || !phone) {
      return NextResponse.json(
        { error: "Tous les champs requis doivent être remplis." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || "";
    const redirectTo = `${origin}/auth/callback`;

    // 1. Appeler generateLink pour créer le compte et obtenir le lien de confirmation
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo,
        data: {
          app: "winelio",
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          sponsor_id: sponsorId || null,
          sponsor_code: sponsorCode || null,
        },
      },
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) {
      return NextResponse.json(
        { error: "Impossible de générer le jeton de confirmation." },
        { status: 500 }
      );
    }

    const customConfirmLink = `${origin}/auth/confirm?token_hash=${tokenHash}&type=signup`;

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
                    Bonjour ${firstName},<br><br>
                    Merci de vous être inscrit sur Winelio. Pour valider votre compte et accéder à votre tableau de bord, veuillez cliquer sur le bouton ci-dessous :
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <!-- Button -->
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${customConfirmLink}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;background:linear-gradient(135deg,#FF6B35,#F7931E);">
                            Valider mon compte →
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
                    <a href="${customConfirmLink}" style="color:#FF6B35;word-break:break-all;">${customConfirmLink}</a>
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
      to: email,
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
