import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

export async function POST(req: Request) {
  try {
    const { email, code, sponsorCode } = await req.json();

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

    // 3. Créer l'utilisateur s'il n'existe pas via RPC SQL (bypass GoTrue admin)
    const { error: createErr } = await supabaseAdmin
      .schema("winelio")
      .rpc("create_auth_user_if_not_exists", { p_email: email });

    if (createErr) {
      console.error("create_auth_user_if_not_exists error:", createErr);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    }

    // 4. Définir un mot de passe temporaire aléatoire en DB (bypass GoTrue admin)
    const tempPassword = randomBytes(32).toString("hex");
    const { error: pwErr } = await supabaseAdmin
      .schema("winelio")
      .rpc("set_user_temp_password", { p_email: email, p_password: tempPassword });

    if (pwErr) {
      console.error("set_user_temp_password error:", pwErr);
      return NextResponse.json({ error: "Erreur de connexion." }, { status: 500 });
    }

    // 5. Créer la session via signInWithPassword (ne dépend pas de GoTrue admin)
    const supabaseBaseUrl = (process.env.SUPABASE_URL || "https://supabase.aide-multimedia.fr").replace(/\/$/, "");
    const tokenResp = await fetch(`${supabaseBaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      },
      body: JSON.stringify({ email, password: tempPassword }),
    });

    // 6. Effacer le mot de passe temporaire immédiatement (l'user reste sans mdp)
    supabaseAdmin
      .schema("winelio")
      .rpc("clear_user_temp_password", { p_email: email })
      .then(({ error: e }) => { if (e) console.error("clear_user_temp_password error:", e); });

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({}));
      console.error("signInWithPassword error:", errData);
      return NextResponse.json({ error: "Erreur de connexion, réessayez." }, { status: 500 });
    }

    const { access_token, refresh_token } = await tokenResp.json();

    // 7. Définir la session via cookies HttpOnly côté serveur
    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();
    const supabaseForSession = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      cookieOptions: {
        name: "sb-winelio-auth-token",
        sameSite: "lax",
      },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2]
            );
          });
        },
      },
    });
    await supabaseForSession.auth.setSession({ access_token, refresh_token });

    // 8. Assigner un parrain si nécessaire
    try {
      const { data: { user: sessionUser } } = await supabaseForSession.auth.getUser();
      if (sessionUser?.id) {
        await assignSponsorIfNeeded(sessionUser.id, sponsorCode ?? null);
      }
    } catch (e) {
      console.error("assign-sponsor in verify-code error:", e);
    }

    return response;
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
