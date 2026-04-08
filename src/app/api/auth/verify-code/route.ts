import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Verify OTP code from our table
    const { data: otp, error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (otpError || !otp) {
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
    // Use request origin so it works on any local port and in production
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "").split("/").slice(0, 3).join("/");
    const siteUrl = origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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
    const verifyResp = await fetch(actionLink, {
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
      return NextResponse.json({ access_token: accessToken, refresh_token: refreshToken });
    }

    // Fallback: if GoTrue uses PKCE code flow, we can't extract tokens server-side
    // Return the action_link so the client can try to follow it
    console.warn("Could not extract tokens from GoTrue redirect, falling back to action_link");
    return NextResponse.json({ action_link: actionLink });

  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
