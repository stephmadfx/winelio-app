import { NextResponse } from "next/server";

const TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Votre code Kiparlo</title>
</head>
<body style="margin:0;padding:0;background-color:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f1117;">
    <tr>
      <td align="center" style="padding:40px 20px;">

        <!-- Wrapper -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1;">
                <span style="color:#ffffff;">KI</span><span style="color:#f97316;">PAR</span><span style="color:#ffffff;">LO</span>
              </span>
              <br/>
              <span style="font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#475569;font-weight:500;">Plateforme de recommandation</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e2230,#181c27);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:48px 40px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.5);">

              <!-- Icon -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="width:64px;height:64px;background:linear-gradient(135deg,#f97316,#fbbf24);border-radius:16px;text-align:center;vertical-align:middle;">
                    <img src="data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHg9IjUiIHk9IjIiIHdpZHRoPSIxNCIgaGVpZ2h0PSIyMCIgcng9IjIiIHJ5PSIyIi8+PGxpbmUgeDE9IjEyIiB5MT0iMTgiIHgyPSIxMi4wMSIgeTI9IjE4Ii8+PC9zdmc+" width="32" height="32" alt="" style="display:block;margin:16px auto;" />
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="font-size:22px;font-weight:700;color:#f8fafc;margin:0 0 10px;">Votre code de connexion</h1>
              <p style="font-size:14px;color:#94a3b8;line-height:1.7;margin:0 0 36px;">
                Utilisez ce code pour vous connecter à votre espace Kiparlo.<br/>
                Saisissez-le directement dans l'application.
              </p>

              <!-- Code label -->
              <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:600;margin:0 0 12px;">
                Code à 6 chiffres
              </p>

              <!-- Code box -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;">
                <tr>
                  <td style="background:linear-gradient(135deg,rgba(249,115,22,0.15),rgba(251,191,36,0.08));border:2px solid rgba(249,115,22,0.5);border-radius:16px;padding:20px 44px;text-align:center;">
                    <span style="font-size:52px;font-weight:800;letter-spacing:14px;color:#ffffff;font-variant-numeric:tabular-nums;line-height:1;display:block;">{{ .Token }}</span>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px;color:#64748b;margin:0 0 36px;">Ce code expire dans 24 heures.</p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr><td style="border-top:1px solid rgba(255,255,255,0.06);font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>

              <!-- Security note -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:rgba(255,255,255,0.03);border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px;text-align:left;">
                    <p style="font-size:12px;color:#64748b;margin:0;line-height:1.6;">
                      🔒 <strong style="color:#94a3b8;">Sécurité :</strong> Ce code est à usage unique et strictement personnel. Si vous n'avez pas demandé à vous connecter, ignorez simplement cet email.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="font-size:12px;color:#334155;margin:0 0 4px;">Cet email a été envoyé par Kiparlo</p>
              <p style="font-size:12px;color:#1e293b;margin:0;">© 2025 Kiparlo. Tous droits réservés.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export async function GET() {
  return new NextResponse(TEMPLATE, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
