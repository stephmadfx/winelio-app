import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestClientRecommendationAction } from "@/lib/notify-client-recommendation-action";
import type { ClientActionPurpose } from "@/lib/client-recommendation-token";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const purpose = body?.purpose as ClientActionPurpose;
  if (!(["quote", "completion"] as const).includes(purpose)) {
    return NextResponse.json({ error: "Type de confirmation invalide" }, { status: 400 });
  }

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, professional_id, client_quote_status, client_completion_status")
    .eq("id", id)
    .single();
  if (!rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  const isAdmin = user.app_metadata?.role === "super_admin";
  if (!isAdmin && rec.professional_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (
    (purpose === "quote" && rec.client_quote_status === "accepted") ||
    (purpose === "completion" && rec.client_completion_status === "confirmed")
  ) {
    return NextResponse.json(
      { error: "Le client a déjà confirmé cette étape" },
      { status: 409 },
    );
  }

  try {
    const result = await requestClientRecommendationAction(id, purpose);
    return NextResponse.json({ ok: true, queued: result.queued });
  } catch (error) {
    console.error("[client-confirmation] request failed:", error);
    return NextResponse.json(
      { error: "La demande de confirmation n'a pas pu être envoyée" },
      { status: 500 },
    );
  }
}
