import { he } from "@/lib/html-escape";

const LOGO_URL = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png";

export function emailShell(params: {
  title: string;
  greeting: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accent?: string;
}): string {
  const cta =
    params.ctaLabel && params.ctaUrl
      ? `<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
         <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;"><a href="${he(params.ctaUrl)}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;">${he(params.ctaLabel)} →</a></td></tr></table></td></tr>`
      : "";
  const accent = params.accent
    ? `<tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="background:#FFF5F0;border-left:3px solid #FF6B35;padding:14px 18px;border-radius:4px;color:#636E72;font-size:13px;line-height:1.6;">${params.accent}</td></tr>`
    : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${he(params.title)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;"><img src="${LOGO_URL}" alt="Winelio" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;"></td></tr>
<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">${he(params.title)}</h1></td></tr>
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${params.greeting}</p></td></tr>
<tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">${params.body}</p></td></tr>
${accent}${cta}
</table></td></tr>
<tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
</table></td></tr></table></body></html>`;
}
