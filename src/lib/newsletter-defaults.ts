export const WINELIO_LOGO_COLOR_URL =
  "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";

export const DEFAULT_NEWSLETTER_MJML = `<mjml>
  <mj-head>
    <mj-preview>{{preheader}}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" color="#2D3436" />
      <mj-text font-size="16px" line-height="1.6" />
      <mj-button background-color="#FF6B35" color="#FFFFFF" border-radius="10px" font-weight="700" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F0F2F4" width="600px">
    <mj-section padding="24px 20px 0">
      <mj-column>
        <mj-image src="${WINELIO_LOGO_COLOR_URL}" alt="Winelio" width="160px" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="32px 40px" border-radius="16px">
      <mj-column>
        <mj-text font-size="24px" font-weight="700" align="center" line-height="1.3">
          Bonjour {{firstName}},
        </mj-text>
        <mj-text align="center" color="#636E72">
          Ajoutez votre contenu Winelio ici. Les variables comme {{unsubscribeUrl}} restent visibles pendant l'édition.
        </mj-text>
        <mj-button href="https://winelio.app" align="center">
          Découvrir Winelio
        </mj-button>
      </mj-column>
    </mj-section>
    <mj-section padding="20px">
      <mj-column>
        <mj-text align="center" color="#B2BAC0" font-size="12px">
          © 2026 Winelio · <a href="{{unsubscribeUrl}}" style="color:#FF6B35;">Se désinscrire</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
