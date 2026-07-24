import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set(["signup", "magiclink"] as const);
type AllowedOtpType = "signup" | "magiclink";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash.trim() : "";
    const requestedType = typeof body.type === "string" ? body.type.trim() : "signup";

    if (!tokenHash) {
      return NextResponse.json({ error: "Jeton de validation manquant." }, { status: 400 });
    }
    if (!ALLOWED_OTP_TYPES.has(requestedType as AllowedOtpType)) {
      return NextResponse.json({ error: "Type de validation invalide." }, { status: 400 });
    }

    const supabase = await createClient();

    // Le lien peut être ouvert alors qu'un autre compte est connecté dans le
    // même navigateur. Effacer uniquement cette session locale avant de
    // confirmer garantit que les cookies écrits ensuite appartiennent au
    // nouveau filleul.
    await supabase.auth.signOut({ scope: "local" });

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: requestedType as AllowedOtpType,
    });

    if (error || !data.session || !data.user) {
      const message = error?.message ?? "La session du nouveau compte n’a pas pu être créée.";
      const expired = message.toLowerCase().includes("expired") || message.toLowerCase().includes("invalid");
      return NextResponse.json(
        {
          error: expired
            ? "Ce lien de validation a déjà été utilisé ou a expiré. Demandez à votre parrain de vous relancer."
            : message,
        },
        { status: 400 }
      );
    }

    // setSession force createServerClient à réécrire les cookies de la réponse
    // avec la session du filleul, avant que le navigateur ne charge la page
    // protégée suivante.
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError || sessionData.user?.id !== data.user.id) {
      return NextResponse.json(
        { error: "Votre adresse e-mail est confirmée, mais la nouvelle session n’a pas pu être enregistrée." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      requiresPasswordSetup: data.user.user_metadata?.requires_password_setup === true,
    });
  } catch (error) {
    console.error("[auth/confirm-referral]", error);
    return NextResponse.json({ error: "Erreur lors de la validation du compte." }, { status: 500 });
  }
}
