const LOGO_URL = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

const CONTENT = [
  {
    subject: "Votre compte Winelio vous attend",
    heading: "Votre place dans le réseau est prête",
    body: (sponsor: string) => `${sponsor} a déjà préparé votre accès à Winelio. Il ne vous reste qu’une étape : confirmer votre adresse et choisir votre mot de passe. Vous pourrez ensuite découvrir votre réseau et commencer à profiter des opportunités partagées par ses membres.`,
    accent: "La validation ne prend que quelques instants et votre mot de passe restera connu de vous seul.",
    cta: "Activer mon compte",
  },
  {
    subject: "Ne laissez pas passer les opportunités de votre réseau",
    heading: "Votre réseau peut déjà vous ouvrir des portes",
    body: (sponsor: string) => `${sponsor} vous a invité(e) pour que vous puissiez recommander des professionnels de confiance, développer votre réseau et suivre les opportunités qui vous concernent. Votre compte est toujours en attente : activez-le maintenant pour accéder à votre espace personnel.`,
    accent: "Une recommandation utile peut créer une vraie opportunité pour vous comme pour votre entourage.",
    cta: "Rejoindre mon réseau",
  },
  {
    subject: "Dernier rappel pour activer votre compte Winelio",
    heading: "Dernier rappel automatique",
    body: () => "Votre compte Winelio n’est pas encore activé. Cette troisième relance est la dernière envoyée automatiquement. Si vous souhaitez rejoindre le réseau, confirmez simplement votre adresse puis créez votre mot de passe personnel.",
    accent: "Après cet e-mail, nous ne vous relancerons plus automatiquement. Vous pourrez toutefois demander un nouveau lien depuis la page de connexion.",
    cta: "Finaliser mon inscription",
  },
] as const;

export function buildPendingAccountReminderEmail(params: {
  reminderNumber: 1 | 2 | 3;
  firstName: string;
  sponsorName: string;
  confirmLink: string;
}) {
  const content = CONTENT[params.reminderNumber - 1];
  const firstName = escapeHtml(params.firstName);
  const sponsorName = escapeHtml(params.sponsorName);
  const confirmLink = escapeHtml(params.confirmLink);
  const body = content.body(sponsorName);

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F0F2F4;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;"><table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;"><tr><td style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:4px 4px 0 0;">&nbsp;</td></tr><tr><td style="background:#FFFFFF;border-radius:0 0 16px 16px;padding:40px 48px 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;"><img src="${LOGO_URL}" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio"></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#2D3436;font-size:20px;font-weight:bold;text-align:center;line-height:1.4;">${content.heading}</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:14px;line-height:1.65;">Bonjour ${firstName},<br><br>${body}</td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td><a href="${confirmLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;padding:14px 28px;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none;">${content.cta} →</a></td></tr></table></td></tr><tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:12px;color:#636E72;font-size:12px;line-height:1.55;">${content.accent}</td></tr><tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="color:#636E72;font-size:11px;line-height:1.5;word-break:break-all;">Si le bouton ne fonctionne pas : <a href="${confirmLink}" style="color:#FF6B35;">${confirmLink}</a></td></tr></table></td></tr><tr><td style="text-align:center;padding:24px 0 0;color:#B2BAC0;font-size:11px;line-height:1.6;">© 2026 Winelio<br><span style="color:#FF6B35;font-weight:bold;">Recommandez. Connectez. Gagnez.</span></td></tr></table></td></tr></table></body></html>`;

  const text = `Bonjour ${params.firstName},\n\n${content.body(params.sponsorName)}\n\n${content.cta} : ${params.confirmLink}\n\n${content.accent}\n\nL’équipe Winelio`;
  return { subject: content.subject, html, text };
}
