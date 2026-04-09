import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    if (profile?.sponsor_id) {
      return NextResponse.json({ success: true, alreadyAssigned: true });
    }

    const { data: sponsorId, error: sponsorError } = await supabaseAdmin.rpc(
      "get_next_open_registration_sponsor",
      { p_exclude_user_id: user.id }
    );

    if (sponsorError) {
      console.error("assign-open-registration-sponsor rpc error:", sponsorError);
      return NextResponse.json({ error: "Impossible de sélectionner une tête de lignée." }, { status: 500 });
    }

    if (!sponsorId) {
      return NextResponse.json({ error: "Aucune tête de lignée disponible." }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ sponsor_id: sponsorId })
      .eq("id", user.id);

    if (updateError) {
      console.error("assign-open-registration-sponsor update error:", updateError);
      return NextResponse.json({ error: "Impossible d'assigner le parrain." }, { status: 500 });
    }

    return NextResponse.json({ success: true, sponsor_id: sponsorId });
  } catch (err) {
    console.error("assign-open-registration-sponsor error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
