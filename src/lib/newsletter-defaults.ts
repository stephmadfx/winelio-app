export const WINELIO_LOGO_COLOR_URL =
  "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";

const LOGO_IMG_HTML = `<img src="${WINELIO_LOGO_COLOR_URL}" alt="Winelio" width="160" height="44" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;max-width:160px;" />`;

// Bouton CTA en dégradé orange→amber via HTML brut (MJML ne gère pas linear-gradient nativement).
const CTA_BUTTON_RAW_HTML = (label: string, href: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="#FF6B35" style="background:linear-gradient(135deg,#FF6B35 0%,#F7931E 100%);background-color:#FF6B35;border-radius:10px;mso-padding-alt:0;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#FFFFFF !important;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:18px;text-decoration:none !important;border-radius:10px;background:linear-gradient(135deg,#FF6B35 0%,#F7931E 100%);">
        ${label} &rarr;
      </a>
    </td>
  </tr>
</table>`;

const UNSUBSCRIBE_FOOTER_RAW_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;border-collapse:collapse;">
  <tr>
    <td align="center" style="color:#B2BAC0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;padding:0;">
      &copy; 2026 Winelio &middot; <a href="{{unsubscribeUrl}}" style="color:#FF6B35;text-decoration:underline;">Se d&eacute;sinscrire</a>
    </td>
  </tr>
</table>`;

const ACCENT_BAR_RAW_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" align="center" style="width:520px;max-width:520px;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">
  <tr>
    <td height="4" width="520" style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,#FF6B35 0%,#F7931E 100%);background-color:#FF6B35;border-radius:4px 4px 0 0;">&nbsp;</td>
  </tr>
</table>`;

export const DEFAULT_NEWSLETTER_MJML = `<mjml>
  <mj-head>
    <mj-preview>{{preheader}}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" color="#2D3436" />
      <mj-text font-size="16px" line-height="1.6" />
    </mj-attributes>
    <mj-style inline="inline">
      a { color: #FF6B35; text-decoration: underline; }
    </mj-style>
    <mj-style>
      @media only screen and (max-width:480px) {
        .winelio-card-padding { padding-left: 24px !important; padding-right: 24px !important; }
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F0F2F4" width="600px">
    <mj-section padding="32px 20px 0">
      <mj-column>
        <mj-text align="center" padding="0">
          ${LOGO_IMG_HTML}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="20px 20px 0">
      <mj-column padding="0">
        <mj-raw>${ACCENT_BAR_RAW_HTML}</mj-raw>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0" border-radius="0 0 16px 16px">
      <mj-column css-class="winelio-card-padding" padding="40px 48px 36px">
        <mj-text font-size="26px" font-weight="700" align="center" line-height="1.3" padding-bottom="8px" color="#2D3436">
          Bonjour {{firstName}},
        </mj-text>
        <mj-text align="center" color="#636E72" padding-bottom="24px">
          Ajoutez votre contenu Winelio ici. Les variables comme
          <a href="{{unsubscribeUrl}}" style="color:#FF6B35;">{{unsubscribeUrl}}</a>
          restent visibles pendant l'&eacute;dition.
        </mj-text>
        <mj-raw>${CTA_BUTTON_RAW_HTML("Découvrir Winelio", "https://winelio.app")}</mj-raw>
      </mj-column>
    </mj-section>

    <mj-section padding="20px 20px 32px">
      <mj-column>
        <mj-raw>${UNSUBSCRIBE_FOOTER_RAW_HTML}</mj-raw>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
