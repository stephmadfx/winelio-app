import { supabaseAdmin } from "@/lib/supabase/admin";
import { queueEmail } from "@/lib/email-queue";
import { emailShell } from "@/lib/notify-client-recommendation-action";
import { he } from "@/lib/html-escape";
import { signClientRecommendationToken } from "@/lib/client-recommendation-token";
import { hasPaidProfessionalCommission } from "@/lib/recommendation-review";
import { unlockRecommendationCommissions } from "@/lib/recommendation-review";
import { notifyReferrerCommissionCredited } from "@/lib/notify-commission-credited";
import { createHash } from "node:crypto";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");
export const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
export const reviewRecipientHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function getCompletedReviewContext(id: string) {
  const { data, error } = await supabaseAdmin.from("recommendations")
    .select("id, status, is_demo, created_at, referrer_id, professional_id, contact:contacts(email), referrer:profiles!recommendations_referrer_id_fkey(email,sponsor_code)")
    .eq("id", id).single();
  if (error) throw error;
  if (!data || data.status !== "COMPLETED" || !(await hasPaidProfessionalCommission(id))) return null;
  return data;
}

export async function clientAffiliationUrl(rec: NonNullable<Awaited<ReturnType<typeof getCompletedReviewContext>>>) {
  const contact = one(rec.contact);
  if (!contact?.email) return null;
  // Ne pas exposer de recherche d'adresse publique : uniquement avec le lien signé.
  const email = contact.email.trim().toLowerCase();
  const { count, error } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).ilike("email", email.replace(/[%_]/g, "\\$&"));
  if (error) throw error;
  const sponsor = one(rec.referrer)?.sponsor_code;
  return !count && sponsor ? `${APP_URL}/auth/login?mode=register&ref=${encodeURIComponent(sponsor)}` : null;
}

export async function notifyCompletedRecommendationReviews(id: string) {
  const rec = await getCompletedReviewContext(id);
  if (!rec) return;
  const referrer = one(rec.referrer);
  if (referrer?.email) await queueEmail({
    to: referrer.email, subject: "Votre recommandation est terminée : donnez votre avis",
    html: emailShell({ title: "Votre avis compte", greeting: "Bonjour,", body: "Est-ce que vous recommanderiez ce professionnel ? Donnez une note de 1 à 5 étoiles. Le commentaire est facultatif. Votre note, quelle que soit sa valeur, permet de débloquer votre commission.", ctaLabel: "Donner mon avis", ctaUrl: `${APP_URL}/recommendations/${id}` }),
    dedupeKey: `referrer-review-invitation:${id}`, throwOnError: true,
  });
  const contact = one(rec.contact);
  if (!contact?.email || contact.email.trim().toLowerCase() === referrer?.email?.trim().toLowerCase()) {
    await markReviewDeliveryQueued(id);
    return;
  }
  const { error: insertError } = await supabaseAdmin.from("review_invitations").upsert({ recommendation_id: id, recipient_hash: reviewRecipientHash(contact.email) }, { onConflict: "recommendation_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  const { data: invitation, error } = await supabaseAdmin.from("review_invitations").select("expires_at").eq("recommendation_id", id).single();
  if (error || !invitation) throw error ?? new Error("Invitation introuvable");
  const token = signClientRecommendationToken({ recommendationId: id, purpose: "review", tokenVersion: 1, expiresAt: invitation.expires_at });
  const affiliationUrl = await clientAffiliationUrl(rec);
  await queueEmail({ to: contact.email, subject: "Votre expérience avec ce professionnel : donnez votre avis",
    html: emailShell({ title: "Votre avis nous intéresse", greeting: "Bonjour,", body: "Votre prestation suivie sur Winelio est terminée. Est-ce que vous recommanderiez ce professionnel ? Vous pouvez laisser une note de 1 à 5 étoiles et, si vous le souhaitez, un commentaire. Aucun compte n’est nécessaire et cette démarche est facultative.", ctaLabel: "Donner mon avis", ctaUrl: `${APP_URL}/recommendations/client-review/${encodeURIComponent(token)}`, accent: affiliationUrl ? `Vous souhaitez aussi recommander des professionnels ? <a href="${he(affiliationUrl)}">Rejoignez Winelio avec votre parrain</a>.` : undefined }),
    dedupeKey: `client-review-invitation:${id}`, throwOnError: true,
  });
  await markReviewDeliveryQueued(id);
}

async function markReviewDeliveryQueued(id: string) {
  const { error } = await supabaseAdmin.from("review_delivery_jobs").update({ queued_at: new Date().toISOString() }).eq("recommendation_id", id);
  if (error) throw error;
}

export async function notifyProfessionalReview(reviewId: string) {
  const { data: review, error } = await supabaseAdmin.from("reviews").select("id,recommendation_id,professional_id,rating,comment,author_role,status").eq("id", reviewId).single();
  if (error) throw error;
  if (!review || review.status !== "published") return;
  if (review.author_role === "referrer") {
    await unlockRecommendationCommissions(review.recommendation_id);
    await notifyReferrerCommissionCredited(review.recommendation_id);
  }
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("email").eq("id", review.professional_id).single();
  if (profileError) throw profileError;
  if (!profile?.email) return;
  const author = review.author_role === "client" ? "client" : "recommandeur";
  await queueEmail({ to: profile.email, subject: `Nouvel avis : ${review.rating}/5 sur Winelio`,
    html: emailShell({ title: "Vous avez reçu un avis", greeting: "Bonjour,", body: `Un ${author} vous a attribué la note de ${review.rating}/5.${review.comment?.trim() ? " Il a également laissé un commentaire auquel vous pouvez répondre une seule fois." : " Cet avis ne contient pas de commentaire."}`, ctaLabel: "Consulter l’avis", ctaUrl: `${APP_URL}/professionnels/${review.professional_id}/avis?avis=${review.id}#avis-${review.id}` }),
    dedupeKey: `professional-review:${review.id}`, throwOnError: true,
  });
  const { error: updateError } = await supabaseAdmin.from("reviews").update({ notification_queued_at: new Date().toISOString() }).eq("id", review.id);
  if (updateError) throw updateError;
}

export async function retryReviewNotifications() {
  const [{ data: jobs, error }, { data: reviews, error: reviewError }] = await Promise.all([
    supabaseAdmin.from("review_delivery_jobs").select("recommendation_id").is("queued_at", null).order("attempted_at").limit(50),
    supabaseAdmin.from("reviews").select("id").eq("status", "published").is("notification_queued_at", null).order("created_at").limit(50),
  ]);
  if (error || reviewError) throw error ?? reviewError;
  for (const job of jobs ?? []) {
    await supabaseAdmin.from("review_delivery_jobs").update({ attempted_at: new Date().toISOString() }).eq("recommendation_id", job.recommendation_id);
    await notifyCompletedRecommendationReviews(job.recommendation_id).catch(() => console.error("Invitation d’avis à reprendre", job.recommendation_id));
  }
  for (const review of reviews ?? []) await notifyProfessionalReview(review.id).catch(() => console.error("Notification d’avis à reprendre", review.id));
}
