import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Verify OTP code from our table (with brute-force protection)
    const { data: otp } = await supabaseAdmin
      .from("otp_codes")
      .select("code, expires_at, attempts")
      .eq("email", email)
      .single();

    // Incrémenter attempts avant de comparer (évite le timing oracle)
    if (otp) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: (otp.attempts ?? 0) + 1 })
        .eq("email", email);
    }

    const isExpired = !otp || otp.expires_at < new Date().toISOString();
    const isBruteForced = (otp?.attempts ?? 0) >= 5;
    const isInvalid = !otp || otp.code !== code;

    if (isExpired || isBruteForced || isInvalid) {
      // Supprimer le code si trop de tentatives ou expiré
      if (otp && (isBruteForced || isExpired)) {
        await supabaseAdmin.from("otp_codes").delete().eq("email", email);
      }
      return NextResponse.json(
        { error: "Code invalide ou expiré." },
        { status: 400 }
      );
    }

    // 2. Delete used code immediately (one-time use)
    await supabaseAdmin.from("otp_codes").delete().eq("email", email);

    // 3. Ensure user exists in Supabase Auth (ignore error if already exists)
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    // 4. Generate admin magic link (does NOT send email)
    // Utiliser exclusivement NEXT_PUBLIC_APP_URL — ne jamais faire confiance au header Origin client (C-2 SSRF fix)
    const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "");
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/auth/callback` },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkError);
      return NextResponse.json({ error: "Erreur de génération du lien." }, { status: 500 });
    }

    const actionLink = linkData.properties.action_link;

    // 5. Follow the action_link server-side (no redirect) to get session tokens
    // GoTrue verifies the token and returns a redirect with tokens in the Location header
    // Replace the external URL (API_EXTERNAL_URL may be misconfigured) with the actual SUPABASE_URL
    const supabaseBaseUrl = (process.env.SUPABASE_URL || "https://supabase.aide-multimedia.fr").replace(/\/$/, "");
    const internalActionLink = actionLink.replace(/^https?:\/\/[^/]+/, supabaseBaseUrl);
    const verifyResp = await fetch(internalActionLink, {
      redirect: "manual",
      headers: { "User-Agent": "WinelioServer/1.0" },
    });

    const location = verifyResp.headers.get("location") || "";
    console.log("GoTrue redirect location:", location);

    // Parse tokens from the Location header
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    try {
      const locUrl = new URL(location);

      // Case 1: Implicit flow → tokens in URL hash (location may look like http://.../#access_token=...)
      const hashStr = locUrl.hash.replace("#", "");
      if (hashStr) {
        const hashParams = new URLSearchParams(hashStr);
        accessToken = hashParams.get("access_token");
        refreshToken = hashParams.get("refresh_token");
      }

      // Case 2: Tokens in query params (some GoTrue versions)
      if (!accessToken) {
        accessToken = locUrl.searchParams.get("access_token");
        refreshToken = locUrl.searchParams.get("refresh_token");
      }
    } catch {
      console.error("Could not parse location URL:", location);
    }

    if (accessToken) {
      // Définit la session via cookies HttpOnly côté serveur — le token n'est pas exposé au client
      const response = NextResponse.json({ success: true });
      const cookieStore = await cookies();
      const supabaseForSession = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        db: { schema: "winelio" },
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                ...options as Parameters<typeof response.cookies.set>[2],
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
              });
            });
          },
        },
      });
      await supabaseForSession.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      });

      // Assigner un parrain si nécessaire (auto-rotation fondateurs)
      try {
        const { data: { user: sessionUser } } = await supabaseForSession.auth.getUser();
        if (sessionUser?.id) {
          await assignSponsorIfNeeded(sessionUser.id);
        }
      } catch (e) {
        console.error("assign-sponsor in verify-code error:", e);
      }

      return response;
    }

    // GoTrue uses PKCE code flow — tokens not extractable server-side
    console.warn("Could not extract tokens from GoTrue redirect (PKCE flow)");
    return NextResponse.json({ error: "Erreur de connexion, réessayez." }, { status: 500 });

  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
