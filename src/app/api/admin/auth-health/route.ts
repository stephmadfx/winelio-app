import { NextResponse } from "next/server";
import { Pool } from "pg";
import nodemailer from "nodemailer";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

export const dynamic = "force-dynamic";

type GhostProfile = { id: string; email: string; app_marker: string | null };
type MissingProfile = { id: string; email: string; created_at: string };

async function runCheck(): Promise<{ ghosts: GhostProfile[]; missing: MissingProfile[] }> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL manquant");

  const pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 8000 });
  try {
    const ghostsRes = await pool.query<GhostProfile>(`
      SELECT p.id, p.email, u.raw_user_meta_data->>'app' AS app_marker
      FROM winelio.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.id != '00000000-0000-0000-0000-000000000001'
        AND (u.raw_user_meta_data->>'app' IS DISTINCT FROM 'winelio')
        AND p.email NOT LIKE '%@winelio-e2e.local'
        AND p.email NOT LIKE '%@winelio-demo.internal'
        AND COALESCE(p.is_demo, false) = false
      ORDER BY p.created_at DESC
    `);
    const missingRes = await pool.query<MissingProfile>(`
      SELECT u.id, u.email, u.created_at::text
      FROM auth.users u
      LEFT JOIN winelio.profiles p ON p.id = u.id
      WHERE p.id IS NULL
        AND u.raw_user_meta_data->>'app' = 'winelio'
      ORDER BY u.created_at DESC
    `);
    return { ghosts: ghostsRes.rows, missing: missingRes.rows };
  } finally {
    pool.end().catch(() => {});
  }
}

function buildAlertHtml(ghosts: GhostProfile[], missing: MissingProfile[]): string {
  const ghostsRows = ghosts
    .map(
      (g) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #F0F2F4;">${g.email}</td><td style="padding:6px 12px;border-bottom:1px solid #F0F2F4;color:#636E72;">${g.app_marker ?? "(none)"}</td></tr>`
    )
    .join("");
  const missingRows = missing
    .map(
      (m) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #F0F2F4;">${m.email}</td><td style="padding:6px 12px;border-bottom:1px solid #F0F2F4;color:#636E72;">${m.created_at}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="background:#FF6B35;height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:32px 40px;">
    <p style="text-align:center;margin:0 0 24px;">${LOGO_IMG_HTML}</p>
    <h1 style="color:#2D3436;font-size:20px;margin:0 0 8px;">⚠️ Alerte sant&eacute; auth</h1>
    <p style="color:#636E72;font-size:14px;margin:0 0 24px;">Le cron de v&eacute;rification a d&eacute;tect&eacute; des incoh&eacute;rences entre <code>auth.users</code> et <code>winelio.profiles</code>.</p>
    ${
      ghosts.length > 0
        ? `<h2 style="color:#2D3436;font-size:16px;margin:24px 0 8px;">Profils fant&ocirc;mes (${ghosts.length})</h2>
           <p style="color:#636E72;font-size:13px;margin:0 0 12px;">Ces profils Winelio existent mais l'<code>auth.users</code> correspondant n'a pas <code>app=winelio</code>. Probablement issus d'une autre app.</p>
           <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;">
             <tr style="background:#FFF5F0;"><th style="padding:8px 12px;text-align:left;color:#FF6B35;">Email</th><th style="padding:8px 12px;text-align:left;color:#FF6B35;">App marker</th></tr>
             ${ghostsRows}
           </table>`
        : ""
    }
    ${
      missing.length > 0
        ? `<h2 style="color:#2D3436;font-size:16px;margin:24px 0 8px;">Users Winelio sans profil (${missing.length})</h2>
           <p style="color:#636E72;font-size:13px;margin:0 0 12px;">Ces users sont marqu&eacute;s <code>app=winelio</code> mais n'ont pas de profil. Le filet de s&eacute;curit&eacute; verify-code aurait d&ucirc; le cr&eacute;er.</p>
           <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;">
             <tr style="background:#FFF5F0;"><th style="padding:8px 12px;text-align:left;color:#FF6B35;">Email</th><th style="padding:8px 12px;text-align:left;color:#FF6B35;">Cr&eacute;&eacute; le</th></tr>
             ${missingRows}
           </table>`
        : ""
    }
    <p style="color:#999;font-size:11px;margin:24px 0 0;border-top:1px solid #F0F2F4;padding-top:16px;">Diagnostic complet : voir feedback_winelio_auth_flow_priority dans la m&eacute;moire Claude.</p>
  </td></tr>
  <tr><td style="text-align:center;padding:16px 0;"><p style="color:#B2BAC0;font-size:11px;margin:0;">&copy; 2026 Winelio &middot; Cron sant&eacute; auth</p></td></tr>
</table></td></tr></table></body></html>`;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ghosts, missing } = await runCheck();
    const hasIssue = ghosts.length > 0 || missing.length > 0;

    if (hasIssue) {
      const smtpPort = Number(process.env.SMTP_PORT) || 465;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "ssl0.ovh.net",
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
      });
      await transporter
        .sendMail({
          from: `"${process.env.SMTP_SENDER_NAME || "Winelio"}" <${process.env.SMTP_USER || "support@winelio.app"}>`,
          to: process.env.AUTH_HEALTH_ALERT_EMAIL || "support@winelio.app",
          subject: `⚠️ Auth health — ${ghosts.length} fantôme(s), ${missing.length} sans profil`,
          html: buildAlertHtml(ghosts, missing),
        })
        .catch((e) => console.error("auth-health mail error:", e));
    }

    return NextResponse.json({
      ok: !hasIssue,
      ghosts: ghosts.length,
      missing_profiles: missing.length,
      details: hasIssue ? { ghosts, missing } : undefined,
    });
  } catch (err) {
    console.error("auth-health error:", err);
    return NextResponse.json({ error: "Erreur serveur", details: String(err) }, { status: 500 });
  }
}
