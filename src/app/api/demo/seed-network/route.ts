import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEMO_MODE = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export async function POST() {
  if (!DEMO_MODE()) {
    return NextResponse.json({ error: "Demo mode désactivé" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Vérifier que le profil est complet
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  if (!profile?.first_name || !profile?.last_name) {
    return NextResponse.json({ error: "Profil incomplet" }, { status: 400 });
  }

  // Guard : déjà seedé
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("demo_owner_id", user.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ already_seeded: true });
  }

  const { error } = await supabaseAdmin.rpc("seed_demo_network", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("seed_demo_network error:", error);
    return NextResponse.json({ error: "Erreur lors du seed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  if (!DEMO_MODE()) {
    return NextResponse.json({ error: "Demo mode désactivé" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { error } = await supabaseAdmin.rpc("purge_demo_network", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("purge_demo_network error:", error);
    return NextResponse.json({ error: "Erreur lors de la purge" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
