function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

export function buildReferralConfirmationEmail(
  firstName: string,
  sponsorName: string,
  confirmLink: string,
  renewed = false,
) {
  const safeFirstName = escapeHtml(firstName);
  const safeSponsorName = escapeHtml(sponsorName);
  const safeLink = escapeHtml(confirmLink);
  const introduction = renewed
    ? `Voici un nouveau lien pour finaliser le compte que ${safeSponsorName} a préinscrit pour vous. Cliquez sur le bouton puis choisissez personnellement votre mot de passe.`
    : `${safeSponsorName} vous a ajouté à son réseau Winelio. Confirmez votre adresse e-mail, puis choisissez personnellement votre mot de passe pour activer votre compte.`;
  const notice = renewed
    ? "Ce nouveau lien remplace le précédent. Il est personnel et doit être utilisé par vous seul."
    : "Votre mot de passe n’a pas été choisi par votre parrain. Vous seul le créerez après cette validation.";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F0F2F4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;"><table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;"><tr><td style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:4px 4px 0 0;">&nbsp;</td></tr><tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;"><img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio"></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#2D3436;font-size:20px;font-weight:bold;text-align:center;line-height:1.4;">Finalisez votre compte Winelio</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:14px;line-height:1.6;">Bonjour ${safeFirstName},<br><br>${introduction}</td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td align="center"><table cellpadding="0" cellspacing="0"><tr><td><a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;padding:14px 28px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none;">Confirmer et créer mon mot de passe →</a></td></tr></table></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:12px;color:#636E72;font-size:12px;line-height:1.5;">${notice}</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:11px;line-height:1.5;word-break:break-all;">Si le bouton ne fonctionne pas : <a href="${safeLink}" style="color:#FF6B35;">${safeLink}</a></td></tr></table></td></tr><tr><td style="text-align:center;padding:24px 0 0;color:#B2BAC0;font-size:11px;line-height:1.6;">© 2026 Winelio<br><span style="color:#FF6B35;font-weight:bold;">Recommandez. Connectez. Gagnez.</span></td></tr></table></td></tr></table></body></html>`;
}
