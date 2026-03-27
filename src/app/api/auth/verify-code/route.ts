import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Verify code from our table
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

    // 3. Ensure user exists in Supabase Auth
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    // Note: error is ignored here — user might already exist, that's fine

    // 4. Generate a magic link via admin (does NOT send email)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${siteUrl}/auth/callback`,
        },
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkError);
      return NextResponse.json(
        { error: "Erreur lors de la connexion. Réessayez." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      action_link: linkData.properties.action_link,
    });
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
