import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Lie le user connecté à la company associée à une recommandation scrapée.
 * Appelée depuis /claim/[recommendationId] une fois le user authentifié.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { recommendationId } = (await req.json()) as { recommendationId?: string };
  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId requis" }, { status: 400 });
  }

  const { data: rec, error: recErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, professional_id")
    .eq("id", recommendationId)
    .single();

  if (recErr || !rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  // La company revendiquée est celle liée au professional de la reco
  const { data: pro } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("id")
    .eq("id", rec.professional_id)
    .single();

  const { data: company } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id, owner_id, source, category_id")
    .eq("owner_id", pro?.id ?? "")
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  }

  // Si déjà claimée par ce user → rien à faire
  if (company.source === "owner" && company.owner_id === user.id) {
    return NextResponse.json({ alreadyClaimed: true });
  }

  // Si déjà claimée par un autre user → refuser
  if (company.source === "owner" && company.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Cette fiche a déjà été revendiquée par un autre utilisateur" },
      { status: 409 }
    );
  }

  // 1. Transférer le owner_id au user connecté + marquer comme owner
  const { error: updateErr } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .update({
      owner_id: user.id,
      source: "owner",
      is_verified: true,
    })
    .eq("id", company.id);

  if (updateErr) {
    return NextResponse.json({ error: `Erreur claim: ${updateErr.message}` }, { status: 500 });
  }

  // 2. Rediriger la reco vers le nouveau user (l'ancien professional_id sera remplacé)
  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ professional_id: user.id })
    .eq("id", recommendationId);

  // 3. Marquer le profile comme is_professional et pro_engagement_accepted
  const { data: previousProfile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("is_professional")
    .eq("id", user.id)
    .single();

  const wasAlreadyPro = !!previousProfile?.is_professional;

  await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .update({
      is_professional: true,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  // 4. Notifier le parrain direct si première activation
  if (!wasAlreadyPro) {
    const { data: cat } = await supabaseAdmin
      .schema("winelio")
      .from("categories")
      .select("name")
      .eq("id", company.category_id ?? "")
      .maybeSingle();

    const { notifyNewProInNetwork } = await import("@/lib/notify-new-pro-in-network");
    notifyNewProInNetwork(user.id, {
      categoryName: cat?.name ?? null,
      workMode: null,
    }).catch((err) =>
      console.error("[claim-finalize] Erreur notify-new-pro-in-network:", err)
    );
  }

  return NextResponse.json({ success: true });
}
