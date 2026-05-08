import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Pool } from "pg";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

async function checkPasswordNotSet(email: string): Promise<boolean> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return false;
  const pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const res = await pool.query<{ has_password: boolean }>(
      `SELECT (encrypted_password IS NOT NULL AND encrypted_password <> '') AS has_password
       FROM auth.users
       WHERE email = $1
         AND raw_user_meta_data->>'app' = 'winelio'
       LIMIT 1`,
      [email]
    );
    if (res.rows.length === 0) return false;
    return res.rows[0].has_password === false;
  } catch (e) {
    console.error("login-password checkPasswordNotSet error:", e);
    return false;
  } finally {
    pool.end().catch(() => {});
  }
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "winelio" },
      cookieOptions: {
        name: "sb-winelio-auth-token",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options as Parameters<typeof response.cookies.set>[2],
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 60 * 60 * 24 * 365,
            });
          });
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      const passwordNotSet = await checkPasswordNotSet(email);
      if (passwordNotSet) {
        return NextResponse.json(
          {
            error: "Aucun mot de passe défini pour ce compte.",
            reason: "password_not_set",
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Email ou mot de passe incorrect." },
        { status: 401 }
      );
    }

    try {
      await assignSponsorIfNeeded(data.user.id);
    } catch (e) {
      console.error("assign-sponsor in login-password error:", e);
    }

    return response;
  } catch (err) {
    console.error("login-password error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
