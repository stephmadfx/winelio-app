import { NextResponse } from "next/server";
import { Pool } from "pg";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getDbUrl(): string | null {
  return process.env.SUPABASE_DB_URL ?? null;
}

export async function POST(req: Request) {
  try {
    const { email, code, password } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

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

    await supabaseAdmin.from("otp_codes").delete().eq("email", email);

    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error("reset-password: SUPABASE_DB_URL manquant");
      return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
    }

    const pgClient = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 8000 });
    try {
      const result = await pgClient.query(
        `UPDATE auth.users
         SET encrypted_password = crypt($1, gen_salt('bf')),
             updated_at = now()
         WHERE email = $2`,
        [password, email]
      );

      if (result.rowCount === 0) {
        return NextResponse.json(
          { error: "Aucun compte associé à cet email." },
          { status: 404 }
        );
      }
    } catch (pgErr) {
      console.error("reset-password pg error:", pgErr);
      return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
    } finally {
      pgClient.end().catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
