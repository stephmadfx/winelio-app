import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewReferral } from "@/lib/notify-new-referral";
import { SUPABASE_URL } from "@/lib/supabase/config";

// Client sans override de schéma pour les RPC dans public
const supabasePublic = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  // Authentification via cookies httpOnly (session serveur)
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Vérifier si l'utilisateur a déjà un parrain
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("sponsor_id")
    .eq("id", user.id)
    .single();

  if (profile?.sponsor_id) {
    return NextResponse.json({ success: true });
  }

  const body = await req.json().catch(() => ({}));
  const { sponsorCode } = body as { sponsorCode?: string | null };

  let sponsorId: string | null = null;

  if (sponsorCode) {
    // Assignation via code parrain fourni
    const { data: sponsor } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("sponsor_code", sponsorCode)
      .neq("id", user.id)
      .single();
    sponsorId = sponsor?.id ?? null;
  } else {
    // Auto-assignation via rotation des fondateurs (fonction dans public)
    const { data, error } = await supabasePublic.rpc("get_next_open_registration_sponsor", {
      p_exclude_user_id: user.id,
    });
    if (error) console.error("assign-sponsor RPC error:", error.message);
    sponsorId = data as string | null;
  }

  if (!sponsorId) {
    return NextResponse.json({ error: "Aucun parrain disponible" }, { status: 422 });
  }

  await supabaseAdmin
    .from("profiles")
    .update({ sponsor_id: sponsorId })
    .eq("id", user.id);

  // Notifie la chaîne de parrainage (non bloquant)
  notifyNewReferral(user.id).catch(() => {});

  return NextResponse.json({ success: true });
}
