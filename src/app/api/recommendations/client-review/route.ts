import { NextResponse } from "next/server";
import { verifyClientRecommendationToken } from "@/lib/client-recommendation-token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientAffiliationUrl, getCompletedReviewContext, notifyProfessionalReview, one, reviewRecipientHash } from "@/lib/review-notifications";
import { validateRecommendationReview } from "@/lib/review-validation";

async function context(token: string) {
  const verified = verifyClientRecommendationToken(token);
  if (!verified.ok || verified.payload.purpose !== "review" || verified.payload.tokenVersion !== 1) return null;
  const id = verified.payload.rid;
  const { data: invitation, error } = await supabaseAdmin.from("review_invitations").select("expires_at,recipient_hash").eq("recommendation_id", id).maybeSingle();
  if (error) throw error;
  if (!invitation || new Date(invitation.expires_at).getTime() < Date.now()) return null;
  const rec = await getCompletedReviewContext(id);
  if (!rec) return null;
  const contact = one(rec.contact);
  if (!contact?.email || contact.email.trim().toLowerCase() === one(rec.referrer)?.email?.trim().toLowerCase()) return null;
  if (invitation.recipient_hash !== reviewRecipientHash(contact.email)) return null;
  return rec;
}

export async function GET(request: Request) {
  const rec = await context(new URL(request.url).searchParams.get("token") ?? "");
  if (!rec) return NextResponse.json({ error: "Ce lien est invalide, expiré ou indisponible." }, { status: 410 });
  const [{ data: review, error }, { data: professional }] = await Promise.all([
    supabaseAdmin.from("reviews").select("id").eq("recommendation_id", rec.id).eq("author_role", "client").maybeSingle(),
    supabaseAdmin.from("companies").select("name").eq("owner_id", rec.professional_id).is("deleted_at", null).limit(1).maybeSingle(),
  ]);
  if (error) throw error;
  return NextResponse.json({ alreadyReviewed: Boolean(review), professionalName: professional?.name ?? "ce professionnel", professionalId: rec.professional_id, affiliationUrl: await clientAffiliationUrl(rec) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const validation = validateRecommendationReview(body?.rating, body?.comment);
  if (!validation.ok) return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  const rec = await context(typeof body?.token === "string" ? body.token : "");
  if (!rec) return NextResponse.json({ error: "Ce lien est invalide, expiré ou indisponible." }, { status: 410 });
  const { data: review, error } = await supabaseAdmin.from("reviews").insert({
    recommendation_id: rec.id, professional_id: rec.professional_id, reviewer_id: null,
    author_role: "client", rating: validation.rating, comment: validation.comment, status: "published",
  }).select("id").single();
  if (error && error.code !== "23505") return NextResponse.json({ error: "Impossible d’enregistrer votre avis." }, { status: 500 });
  const { data: saved } = review ? { data: review } : await supabaseAdmin.from("reviews").select("id").eq("recommendation_id", rec.id).eq("author_role", "client").single();
  if (saved) await notifyProfessionalReview(saved.id);
  return NextResponse.json({ success: true, alreadyReviewed: Boolean(error) });
}
