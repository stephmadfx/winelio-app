import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewReferral } from "@/lib/notify-new-referral";

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
    // Auto-assignation : rotation round-robin sur les fondateurs
    sponsorId = await getNextFounderSponsor(user.id);
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

/**
 * Rotation round-robin parmi les fondateurs (is_founder = true).
 * Assigne au fondateur ayant le moins de filleuls directs.
 * En cas d'égalité, prend le plus ancien (created_at ASC).
 */
async function getNextFounderSponsor(excludeUserId: string): Promise<string | null> {
  // Récupère tous les fondateurs
  const { data: founders } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("is_founder", true)
    .neq("id", excludeUserId)
    .order("created_at", { ascending: true });

  if (!founders || founders.length === 0) return null;

  // Compte les filleuls directs de chaque fondateur
  const counts = await Promise.all(
    founders.map(async (f) => {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", f.id);
      return { id: f.id, count: count ?? 0 };
    })
  );

  // Choisit le fondateur avec le moins de filleuls
  counts.sort((a, b) => a.count - b.count);
  return counts[0].id;
}
