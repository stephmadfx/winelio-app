import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

// URL GoTrue directe (sans PostgREST, pas de statement_timeout)
const GOTRUE_URL = (process.env.SUPABASE_URL || "https://supabase.aide-multimedia.fr").replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function gotrueRequest(path: string, method: string, body?: object) {
  return fetch(`${GOTRUE_URL}/auth/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function POST(req: Request) {
  try {
    const { email, code, sponsorCode } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // 1. Verify OTP code (with brute-force protection)
    const { data: otp } = await supabaseAdmin
      .from("otp_codes")
      .select("code, expires_at, attempts")
      .eq("email", email)
      .single();

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
      return NextResponse.json({ error: "Code invalide ou expiré." }, { status: 400 });
    }

    // 2. Delete used code immediately
    await supabaseAdmin.from("otp_codes").delete().eq("email", email);

    // 3. Créer l'utilisateur si nécessaire via GoTrue admin (pas PostgREST)
    let userId: string | null = null;
    const createResp = await gotrueRequest("/admin/users", "POST", {
      email,
      email_confirm: true,
    });

    if (createResp.ok) {
      const created = await createResp.json();
      userId = created.id ?? null;
    } else if (createResp.status === 422) {
      // Utilisateur existant — récupérer son ID
      const listResp = await gotrueRequest(`/admin/users?email=${encodeURIComponent(email)}`, "GET");
      if (listResp.ok) {
        const { users } = await listResp.json();
        userId = users?.[0]?.id ?? null;
      }
    }

    if (!userId) {
      console.error("verify-code: impossible de trouver/créer l'utilisateur");
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    }

    // 4. Définir un mot de passe temporaire via GoTrue admin (pas PostgREST)
    const tempPassword = randomBytes(32).toString("hex");
    const pwResp = await gotrueRequest(`/admin/users/${userId}`, "PUT", {
      password: tempPassword,
    });

    if (!pwResp.ok) {
      console.error("verify-code: set temp password failed", await pwResp.text());
      return NextResponse.json({ error: "Erreur de connexion." }, { status: 500 });
    }

    // 5. Créer la session via signInWithPassword (endpoint non-admin, rapide)
    const tokenResp = await gotrueRequest("/token?grant_type=password", "POST", {
      email,
      password: tempPassword,
    });

    // 6. Effacer le mot de passe temporaire (fire-and-forget)
    gotrueRequest(`/admin/users/${userId}`, "PUT", { password: null })
      .catch((e) => console.error("clear temp password error:", e));

    if (!tokenResp.ok) {
      console.error("verify-code: signInWithPassword failed", await tokenResp.text().catch(() => ""));
      return NextResponse.json({ error: "Erreur de connexion, réessayez." }, { status: 500 });
    }

    const { access_token, refresh_token } = await tokenResp.json();

    // 7. Définir la session via cookies HttpOnly
    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();
    const supabaseForSession = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      cookieOptions: { name: "sb-winelio-auth-token", sameSite: "lax" },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
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
      console.error("assign-sponsor error:", e);
    }

    return response;
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
