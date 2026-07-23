import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { password, termsAccepted, activation = false } = await req.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const requiresPasswordSetup = user.user_metadata?.requires_password_setup === true;
    if (activation === true && !requiresPasswordSetup) {
      return NextResponse.json({ error: "Ce compte n’est pas en attente d’activation." }, { status: 409 });
    }
    if (requiresPasswordSetup && termsAccepted !== true) {
      return NextResponse.json(
        { error: "Vous devez accepter les conditions générales pour activer votre compte." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    });

    if (error) {
      console.error("set-password admin error:", error);
      return NextResponse.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
    }


    if (requiresPasswordSetup) {
      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        onboarding_status: "active",
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
      }).eq("id", user.id);
      if (profileError) {
        console.error("set-password profile activation error:", profileError);
        return NextResponse.json({ error: "Le mot de passe est enregistré, mais l’activation du profil a échoué. Veuillez réessayer." }, { status: 500 });
      }

      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, requires_password_setup: false },
      });
      if (metadataError) {
        console.error("set-password metadata activation error:", metadataError);
        return NextResponse.json({ error: "Le profil est activé, mais la finalisation de la session a échoué. Veuillez réessayer." }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("set-password error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
