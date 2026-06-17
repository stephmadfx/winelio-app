import Link from "next/link";
import { Plus } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const statusLabels = {
  draft: "Brouillon",
  ready: "Prêt",
  archived: "Archivé",
} as const;

export default async function NewslettersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: newsletters } = await supabaseAdmin
    .schema("winelio")
    .from("newsletter_templates")
    .select("id, name, subject, preheader, status, updated_at, created_at")
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
            <Link
              key={newsletter.id}
              href={`/gestion-reseau/newsletters/${newsletter.id}`}
              className="block rounded-xl border border-border bg-card p-5 transition-all hover:border-winelio-orange/60 hover:shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{newsletter.name}</h2>
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
