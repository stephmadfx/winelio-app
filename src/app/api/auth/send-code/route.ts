import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LOGO_IMG_HTML } from "@/lib/email-logo";
import { sendEmail } from "@/lib/email-sender";
import { getEmailDisabledReason } from "@/lib/email-environment";

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

// ── Rate-limit dédié OTP ─────────────────────────────────────
// 5 demandes/heure par IP, exempté pour les emails de test E2E.
// L'email est validé AVANT le rate-limit pour pouvoir bypass les
// adresses @winelio-e2e.local sans consommer le compteur.
const otpBuckets = new Map<string, { count: number; resetAt: number }>();
const OTP_LIMIT  = 5;
const OTP_WINDOW = 60 * 60 * 1000;

function isOtpRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = otpBuckets.get(ip);
  if (!entry || now > entry.resetAt) {
    otpBuckets.set(ip, { count: 1, resetAt: now + OTP_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > OTP_LIMIT;
}

function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
  <tr><td style="background:#FF6B35;height:4px;font-size:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
  <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:32px 40px;">
    <p style="text-align:center;margin:0 0 24px;">${LOGO_IMG_HTML}</p>
    <h1 style="color:#2D3436;font-size:20px;text-align:center;margin:0 0 8px;">Votre code de connexion</h1>
    <p style="color:#636E72;font-size:14px;text-align:center;margin:0 0 28px;">
      Saisissez ce code pour acceder a votre compte Winelio.
    </p>
    <p style="text-align:center;margin:0 0 28px;">
      <span style="display:inline-block;background:#FFF5F0;border:2px solid #FF6B35;border-radius:12px;padding:16px 40px;font-size:36px;font-weight:800;letter-spacing:10px;color:#2D3436;font-family:'Courier New',monospace;">
        ${code}
      </span>
    </p>
    <p style="color:#636E72;font-size:12px;text-align:center;margin:0 0 24px;">
      Ce code est valable <strong style="color:#2D3436;">24 heures</strong> et a usage unique.
    </p>
    <p style="color:#999;font-size:11px;text-align:center;margin:0;border-top:1px solid #F0F2F4;padding-top:16px;">
      Si vous n'avez pas fait cette demande, ignorez cet email.
    </p>
  </td></tr>
  <tr><td style="text-align:center;padding:16px 0;">
    <p style="color:#B2BAC0;font-size:11px;margin:0;">© 2026 Winelio · Recommandez. Connectez. Gagnez.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // La route OTP sert uniquement à se connecter. La création d'un compte
    // passe obligatoirement par le formulaire d'inscription avec téléphone.
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, onboarding_status")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (profileError) {
      console.error("send-code profile lookup error:", profileError.code);
      return NextResponse.json({ error: "Erreur serveur. Réessayez." }, { status: 500 });
    }
    if (!existingProfile) {
      return NextResponse.json(
        { error: "Aucun compte actif n’est associé à cette adresse e-mail. Créez d’abord votre compte." },
        { status: 404 }
      );
    }
    if (existingProfile.onboarding_status === "pending_confirmation") {
      return NextResponse.json(
        { error: "Ce compte attend encore la confirmation envoyée par e-mail." },
        { status: 409 }
      );
    }

    // E2E test recipients : on saute aussi le rate-limit OTP (sinon les tests
    // qui créent plusieurs comptes/run sont bloqués).
    const isE2EAddress = /@winelio-e2e\.local$/i.test(normalizedEmail);

    const disabledReason = getEmailDisabledReason();
    if (disabledReason && !isE2EAddress) {
      console.warn(`[send-code] Envoi OTP ignoré: ${disabledReason}`);
      return NextResponse.json({ error: "Envoi email désactivé sur cet environnement." }, { status: 403 });
    }

    if (!isE2EAddress) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "unknown";
      if (isOtpRateLimited(ip)) {
        return NextResponse.json(
          { error: "Trop de demandes de code en peu de temps. Réessayez dans 1 heure." },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    // Store code in Supabase (upsert → replace existing code for same email, reset attempts)
    const { error: dbError } = await supabaseAdmin
      .from("otp_codes")
      .upsert({ email: normalizedEmail, code, expires_at: expiresAt, attempts: 0 }, { onConflict: "email" });

    if (dbError) {
      console.error("send-code DB error:", dbError?.code, dbError?.message);
      return NextResponse.json(
        { error: "Erreur serveur. Réessayez." },
        { status: 500 }
      );
    }

    // E2E test recipients : on saute l'envoi SMTP (le code reste en DB et
    // sera lu directement par les tests Playwright).
    if (!isE2EAddress) {
      const result = await sendEmail({
        to: normalizedEmail,
        subject: "Votre code de connexion Winelio",
        text: `Votre code de connexion Winelio : ${code}\n\nCe code est valable 24 heures et à usage unique.\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\n---\n© 2026 Winelio · Recommandez. Connectez. Gagnez.`,
        html: buildEmailHtml(code),
      });
      if (!result.ok) {
        console.error("send-code email failed:", result.error);
        return NextResponse.json({ error: "Envoi du code temporairement indisponible. Réessayez." }, { status: 504 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-code error:", err);
    return NextResponse.json({ error: "Envoi du code temporairement indisponible. Réessayez." }, { status: 504 });
  }
}
