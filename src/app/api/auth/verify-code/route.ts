import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { randomBytes } from "crypto";
import { Pool } from "pg";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

// Connexion pg directe par requête (pas de pool singleton — évite l'état d'erreur au démarrage)
function getDbUrl(): string | null {
  return process.env.SUPABASE_DB_URL ?? null;
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

    // 3. Créer/trouver l'utilisateur + définir un mot de passe temporaire
    //    via connexion PostgreSQL directe (bypass GoTrue admin + PostgREST timeouts)
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error("verify-code: SUPABASE_DB_URL manquant");
      return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
    }

    const tempPassword = randomBytes(32).toString("hex");
    const pgClient = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 8000 });
    let userId: string | null = null;

    try {
      await pgClient.query("BEGIN");

      // Créer l'utilisateur s'il n'existe pas (trigger corrigé vers winelio.profiles)
      const upsertRes = await pgClient.query<{ id: string }>(`
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user)
        VALUES (gen_random_uuid(), 'authenticated', 'authenticated', $1, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, false)
        ON CONFLICT (email) WHERE is_sso_user = false DO UPDATE SET updated_at = now()
        RETURNING id
      `, [email]);

      userId = upsertRes.rows[0]?.id ?? null;

      if (!userId) {
        // Si ON CONFLICT ne retourne pas l'id (vieux PostgreSQL), on le récupère
        const selectRes = await pgClient.query<{ id: string }>(
          "SELECT id FROM auth.users WHERE email = $1 LIMIT 1", [email]
        );
        userId = selectRes.rows[0]?.id ?? null;
      }

      if (!userId) {
        throw new Error("Impossible de trouver l'utilisateur après upsert");
      }

      // Définir le mot de passe temporaire
      await pgClient.query(
        "UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf')) WHERE id = $2",
        [tempPassword, userId]
      );

      await pgClient.query("COMMIT");
    } catch (pgErr) {
      await pgClient.query("ROLLBACK").catch(() => {});
      console.error("verify-code pg error:", pgErr);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    } finally {
      pgClient.end().catch(() => {});
    }

    // 4. Créer la session via signInWithPassword (rapide, ne dépend pas de GoTrue admin)
    const supabaseBaseUrl = (process.env.SUPABASE_URL || "https://supabase.aide-multimedia.fr").replace(/\/$/, "");
    const tokenResp = await fetch(`${supabaseBaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      },
      body: JSON.stringify({ email, password: tempPassword }),
    });

    // 5. Effacer le mot de passe temporaire (fire-and-forget)
    new Pool({ connectionString: dbUrl, max: 1 })
      .query("UPDATE auth.users SET encrypted_password = NULL WHERE email = $1", [email])
      .catch((e) => console.error("clear temp password error:", e));

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({}));
      console.error("signInWithPassword error:", errData);
      return NextResponse.json({ error: "Erreur de connexion, réessayez." }, { status: 500 });
    }

    const { access_token, refresh_token } = await tokenResp.json();

    // 6. Définir la session via cookies HttpOnly
    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();
    const supabaseForSession = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      cookieOptions: { name: "sb-winelio-auth-token", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // maxAge EN DERNIER pour override le TTL court (3600s) que Supabase fixe sur l'access token
            response.cookies.set(name, value, { ...(options ?? {}), maxAge: 60 * 60 * 24 * 365 } as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    });
    await supabaseForSession.auth.setSession({ access_token, refresh_token });

    // 7. Assigner un parrain si nécessaire
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
