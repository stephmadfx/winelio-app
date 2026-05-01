import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyRecoRefused } from "@/lib/notify-reco-refused";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, status, professional_id")
    .eq("id", id)
    .single();

  if (!rec) return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  if (rec.professional_id !== user.id) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  if (rec.status !== "PENDING") return NextResponse.json({ error: "Cette recommandation ne peut plus être refusée" }, { status: 400 });

  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ status: "CANCELLED" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Erreur lors du refus" }, { status: 500 });

  // Annuler les relances pending pour cette reco
  await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .update({ status: "cancelled", cancel_reason: "reco_refused" })
    .eq("recommendation_id", id)
    .eq("status", "pending");

  notifyRecoRefused(id).catch((err) => console.error("notify-reco-refused error:", err));

  return NextResponse.json({ success: true });
}
