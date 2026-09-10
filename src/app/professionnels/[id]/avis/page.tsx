import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/get-user";
import { WinelioLogo } from "@/components/winelio-logo";
import { ProfessionalRating } from "@/components/professional-rating";
import { ProfessionalReviewReply } from "@/components/professional-review-reply";

export const dynamic = "force-dynamic";
export default async function ProfessionalReviewsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; avis?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  let page = Math.max(1, Math.min(100000, Number.parseInt(query.page ?? "1", 10) || 1));
  // Un ancien email doit toujours mener à la page contenant l’avis concerné.
  if (query.avis && /^[0-9a-f-]{36}$/i.test(query.avis)) {
    const { data: target, error: targetError } = await supabaseAdmin.from("reviews").select("id,created_at").eq("id", query.avis).eq("professional_id", id).eq("status", "published").maybeSingle();
    if (targetError) throw targetError;
    if (target) {
      const { count, error: countError } = await supabaseAdmin.from("reviews").select("id", { count: "exact", head: true }).eq("professional_id", id).eq("status", "published").or(`created_at.gt.${target.created_at},and(created_at.eq.${target.created_at},id.lt.${target.id})`);
      if (countError) throw countError;
      page = Math.floor((count ?? 0) / 20) + 1;
    }
  }
  const [{ data: professional }, { data: company }, { data: summary, error: summaryError }, { data: reviews, error }, user] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,first_name").eq("id", id).maybeSingle(),
    supabaseAdmin.from("companies").select("name").eq("owner_id", id).is("deleted_at", null).limit(1).maybeSingle(),
    supabaseAdmin.from("professional_review_summaries").select("avg_rating,review_count").eq("professional_id", id).maybeSingle(),
    supabaseAdmin.from("reviews").select("id,rating,comment,author_role,created_at,professional_reply,replied_at").eq("professional_id", id).eq("status", "published").order("created_at", { ascending: false }).order("id").range((page-1)*20, page*20-1),
    getUser(),
  ]);
  if (error || summaryError) throw error ?? summaryError;
  if (!professional) notFound();
  return <main className="min-h-screen bg-winelio-light px-5 py-10 text-winelio-dark"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/dashboard" aria-label="Accueil Winelio"><WinelioLogo height={38} /></Link>
    <header className="space-y-3"><h1 className="text-2xl font-bold">Avis sur {company?.name || professional.first_name || "ce professionnel"}</h1>
      {summary ? <div className="flex flex-wrap items-center gap-3"><ProfessionalRating average={Number(summary.avg_rating)} /><span className="text-sm text-gray-600">{summary.review_count} avis</span></div> : <p>Pas encore d’avis.</p>}
      <p className="text-sm text-gray-600">Avis de recommandeurs et de clients liés à une prestation suivie sur Winelio. Chaque note déposée a le même poids dans la moyenne. Les recommandeurs reçoivent leur commission après avoir déposé un avis, quelle que soit la note.</p>
      {!user && <Link className="block text-sm text-winelio-orange underline" href={`/auth/login?returnTo=${encodeURIComponent(`/professionnels/${id}/avis`)}`}>Vous êtes ce professionnel ? Connectez-vous pour répondre aux commentaires.</Link>}
    </header>
    {(reviews ?? []).map(review => <article key={review.id} id={`avis-${review.id}`} className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><ProfessionalRating average={review.rating} /><time className="text-xs text-gray-500" dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("fr-FR")}</time></div>
      <p className="mt-2 text-sm font-semibold">{review.author_role === "client" ? "Avis du client" : "Avis du recommandeur"}</p>
      {review.comment?.trim() && <p className="mt-3 whitespace-pre-wrap break-words">{review.comment}</p>}
      {review.professional_reply ? <div className="mt-4 border-l-2 border-winelio-orange bg-orange-50 p-4"><p className="text-sm font-semibold">Réponse du professionnel</p><p className="mt-2 whitespace-pre-wrap break-words">{review.professional_reply}</p></div> : user?.id === id && review.comment?.trim() ? <ProfessionalReviewReply reviewId={review.id} /> : null}
    </article>)}
    <nav className="flex justify-between text-winelio-orange" aria-label="Pages d’avis">{page > 1 ? <Link href={`?page=${page-1}`}>Avis précédents</Link> : <span />}{page*20 < (summary?.review_count ?? 0) && <Link href={`?page=${page+1}`}>Avis suivants</Link>}</nav>
  </div></main>;
}
