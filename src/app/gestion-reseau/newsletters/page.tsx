import Link from "next/link";
import { Plus } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";

const statusLabels = {
  draft: "Brouillon",
  ready: "Prêt",
  archived: "Archivé",
} as const;

export default async function NewslettersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await assertNewsletterAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const { data: campaigns, error: campaignsError, count } = await supabaseAdmin.from("newsletters")
    .select("id, subject, is_test, status, sent_at, created_at, recipient_count, sent_count, failed_count, opened_count, clicked_count", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / 20));
  const campaignStatuses: Record<string, string> = { sent: "Envoyée", sending: "En cours", failed: "Échec", draft: "Brouillon", scheduled: "Programmée" };

  const { data: newsletters } = await supabaseAdmin
    .schema("winelio")
    .from("newsletter_templates")
    .select("id, name, subject, preheader, status, updated_at, created_at, last_campaign_id")
    .eq("user_id", user?.id ?? "")
    .order("updated_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Newsletters</h1>
          <p className="mt-1 text-sm text-muted-foreground">Création, prévisualisation et export des campagnes email Winelio</p>
        </div>
        <Link
          href="/gestion-reseau/newsletters/new"
          className="inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" />
          Nouvelle newsletter
        </Link>
      </div>

      {!newsletters || newsletters.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          Aucune newsletter pour le moment.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {newsletters.map((newsletter) => (
            <div
              key={newsletter.id}
              className="block rounded-xl border border-border bg-card p-5 transition-all hover:border-winelio-orange/60 hover:shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold"><Link href={`/gestion-reseau/newsletters/${newsletter.id}`} className="hover:text-winelio-orange">{newsletter.name}</Link></h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{newsletter.subject || "Sujet non défini"}</p>
                </div>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-winelio-orange">
                  {statusLabels[newsletter.status as keyof typeof statusLabels] ?? "Brouillon"}
                </span>
              </div>
              <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                {newsletter.preheader || "Aucun preheader renseigné."}
              </p>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Modifiée le {new Date(newsletter.updated_at).toLocaleDateString("fr-FR")}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium text-winelio-orange">
                <Link href={`/gestion-reseau/newsletters/${newsletter.id}`}>Ouvrir l’éditeur</Link>
                {newsletter.last_campaign_id && <Link href={`/gestion-reseau/newsletters/campagnes/${newsletter.last_campaign_id}`}>Voir les statistiques</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
      <section className="mt-10 space-y-4">
        <div><h2 className="text-xl font-bold">Historique des campagnes</h2><p className="mt-1 text-sm text-muted-foreground">Retrouvez les résultats de chaque envoi, même après modification d’un template.</p></div>
        {campaignsError ? <p role="alert" className="text-red-600">Impossible de charger l’historique. Rechargez la page pour réessayer.</p> : !campaigns?.length ? <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">Aucune campagne sur cette page.</p> : campaigns.map(campaign => <Link key={campaign.id} href={`/gestion-reseau/newsletters/campagnes/${campaign.id}`} className="block rounded-xl border border-border bg-card p-5 hover:border-winelio-orange/60">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{campaign.is_test && <span className="mr-2 text-winelio-orange">Test ·</span>}{campaign.subject || "Sans objet"}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(campaign.sent_at || campaign.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p></div><span className="text-sm text-winelio-orange">{campaignStatuses[campaign.status] || campaign.status} · Voir le rapport →</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">{[["Envois acceptés", campaign.sent_count], ["Échecs", campaign.failed_count], ["Ouvertures détectées", campaign.opened_count], ["Ont cliqué", campaign.clicked_count]].map(([label, value]) => <p key={label}><strong className="mr-2">{value}</strong><span className="text-muted-foreground">{label}</span></p>)}</div>
        </Link>)}
        {!campaignsError && pages > 1 && <div className="flex items-center justify-between text-sm">{page > 1 ? <Link href={`?page=${page - 1}`} className="text-winelio-orange">Précédent</Link> : <span />}<span>Page {page} sur {pages}</span>{page < pages ? <Link href={`?page=${page + 1}`} className="text-winelio-orange">Suivant</Link> : <span />}</div>}
      </section>
    </div>
  );
}
