import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateReviewComment } from "@/lib/review-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const validation = validateReviewComment(body?.comment);
  if (!validation.ok || !validation.comment) return NextResponse.json({ error: validation.ok ? "Saisissez votre réponse." : validation.errors.join(" ") }, { status: 400 });
  const { id } = await params;
  const { data: review, error } = await supabaseAdmin.from("reviews").select("id,comment,professional_reply").eq("id", id).eq("professional_id", user.id).eq("status", "published").maybeSingle();
  if (error) throw error;
  if (!review) return NextResponse.json({ error: "Avis introuvable ou accès refusé." }, { status: 404 });
  if (!review.comment?.trim() || review.professional_reply !== null) return NextResponse.json({ error: "Une seule réponse est possible, uniquement pour un avis contenant un commentaire." }, { status: 409 });
  const { data: updated, error: updateError } = await supabaseAdmin.from("reviews").update({ professional_reply: validation.comment, replied_at: new Date().toISOString() }).eq("id", id).eq("professional_id", user.id).is("professional_reply", null).select("id").maybeSingle();
  if (updateError) return NextResponse.json({ error: "Impossible d’enregistrer la réponse." }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Une réponse a déjà été publiée." }, { status: 409 });
  return NextResponse.json({ success: true });
}
