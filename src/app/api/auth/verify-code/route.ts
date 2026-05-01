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
    let previousPasswordHash: string | null = null;

    try {
      await pgClient.query("BEGIN");

      // Créer l'utilisateur s'il n'existe pas (trigger corrigé vers winelio.profiles).
      // GoTrue self-hosted attend des chaînes vides, pas NULL, sur plusieurs
      // colonnes token héritées du schéma auth.
      const upsertRes = await pgClient.query<{ id: string }>(`
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          email_confirmed_at,
          confirmation_token,
          recovery_token,
          email_change_token_new,
          email_change,
          email_change_token_current,
          phone_change,
          phone_change_token,
          reauthentication_token,
          created_at,
          updated_at,
          raw_app_meta_data,
          raw_user_meta_data,
          is_super_admin,
          is_sso_user,
          is_anonymous
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000',
          gen_random_uuid(),
          'authenticated',
          'authenticated',
          $1,
          now(),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          now(),
          now(),
          '{"provider":"email","providers":["email"]}',
          '{"app":"winelio"}'::jsonb,
          false,
          false,
          false
        )
        ON CONFLICT (email) WHERE is_sso_user = false DO UPDATE SET
          instance_id = COALESCE(auth.users.instance_id, '00000000-0000-0000-0000-000000000000'),
          confirmation_token = COALESCE(auth.users.confirmation_token, ''),
          recovery_token = COALESCE(auth.users.recovery_token, ''),
          email_change_token_new = COALESCE(auth.users.email_change_token_new, ''),
          email_change = COALESCE(auth.users.email_change, ''),
          email_change_token_current = COALESCE(auth.users.email_change_token_current, ''),
          phone_change = COALESCE(auth.users.phone_change, ''),
          phone_change_token = COALESCE(auth.users.phone_change_token, ''),
          reauthentication_token = COALESCE(auth.users.reauthentication_token, ''),
          updated_at = now()
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

      // Sauvegarde du hash existant pour le restaurer après création de session.
      // Sans ça, l'étape 5 (effacement du tempPassword) wipe les mdp définis
      // explicitement par les users via /api/auth/set-password.
      const previousRes = await pgClient.query<{ encrypted_password: string | null }>(
        "SELECT encrypted_password FROM auth.users WHERE id = $1",
        [userId]
      );
      previousPasswordHash = previousRes.rows[0]?.encrypted_password ?? null;

      // Définir le mot de passe temporaire + marquer le projet d'origine.
      // Le marker 'app: winelio' permet au trigger winelio.handle_new_user de filtrer
      // les users d'autres projets partageant la même instance Supabase Auth.
      await pgClient.query(
        `UPDATE auth.users
         SET encrypted_password = crypt($1, gen_salt('bf')),
             raw_user_meta_data = jsonb_build_object(
               'sub', id::text,
               'email', email,
               'email_verified', true,
               'phone_verified', false,
               'app', 'winelio'
             )
         WHERE id = $2`,
        [tempPassword, userId]
      );

      await pgClient.query(`
        INSERT INTO auth.identities (
          provider_id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        SELECT
          u.id::text,
          u.id,
          jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
          'email',
          now(),
          now(),
          now()
        FROM auth.users u
        WHERE u.id = $1::uuid
        ON CONFLICT (provider_id, provider) DO UPDATE SET
          identity_data = excluded.identity_data,
          updated_at = now()
      `, [userId]);

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

    // 5. Restaurer l'état initial du mot de passe (fire-and-forget).
    // Si l'utilisateur avait un mdp permanent avant, on remet son hash.
    // Sinon on remet NULL (état initial pour les comptes 100% OTP).
    new Pool({ connectionString: dbUrl, max: 1 })
      .query("UPDATE auth.users SET encrypted_password = $1 WHERE email = $2", [previousPasswordHash, email])
      .catch((e) => console.error("restore password error:", e));

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
