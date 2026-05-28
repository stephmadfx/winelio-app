import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  hasPaidProfessionalCommission,
  unlockRecommendationCommissions,
  validateRecommendationReview,
} from "@/lib/recommendation-review";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const validation = validateRecommendationReview(body?.rating, body?.answers);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  const { data: rec } = await supabaseAdmin
    .from("recommendations")
    .select("id, referrer_id, professional_id")
    .eq("id", id)
    .single();

  if (!rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  if (rec.referrer_id !== user.id) {
    return NextResponse.json(
      { error: "Seul le recommandeur peut déposer l'avis de paiement." },
      { status: 403 }
    );
  }

  if (!(await hasPaidProfessionalCommission(rec.id))) {
    return NextResponse.json(
      { error: "Avis en attente : le professionnel doit d'abord régler sa commission Winelio." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("reviews")
    .upsert(
      {
        recommendation_id: rec.id,
        reviewer_id: user.id,
        professional_id: rec.professional_id,
        rating: validation.rating,
        comment: validation.comment,
        answers: validation.answers,
        status: "published",
      },
      { onConflict: "recommendation_id,reviewer_id" }
    );

  if (error) {
    return NextResponse.json({ error: "Impossible d'enregistrer l'avis." }, { status: 500 });
  }

  const payout = await unlockRecommendationCommissions(rec.id);
  return NextResponse.json({ success: true, payout });
}
