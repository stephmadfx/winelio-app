import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  PENDING:           { label: "En attente",    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",   dot: "bg-yellow-400" },
  ACCEPTED:          { label: "Acceptée",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20",        dot: "bg-blue-400" },
  CONTACT_MADE:      { label: "Contact établi", color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",  dot: "bg-indigo-400" },
  MEETING_SCHEDULED: { label: "RDV fixé",       color: "text-purple-400 bg-purple-400/10 border-purple-400/20", dot: "bg-purple-400" },
  QUOTE_SUBMITTED:   { label: "Devis soumis",   color: "text-orange-400 bg-orange-400/10 border-orange-400/20", dot: "bg-orange-400" },
  QUOTE_VALIDATED:   { label: "Devis validé",   color: "text-amber-400 bg-amber-400/10 border-amber-400/20",    dot: "bg-amber-400" },
  PAYMENT_RECEIVED:  { label: "Paiement reçu",  color: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20", dot: "bg-emerald-300" },
  COMPLETED:         { label: "Terminée",       color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
  CANCELLED:         { label: "Annulée",        color: "text-red-400 bg-red-400/10 border-red-400/20",          dot: "bg-red-400" },
};

export default async function AdminRecommandations({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const pageSize = 25;

  let query = supabaseAdmin
    .from("recommendations")
    .select(
      `id, status, amount, created_at,
       referrer:profiles!referrer_id(first_name, last_name),
       professional:profiles!professional_id(first_name, last_name),
       recommendation_steps(id, completed_at)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.status) query = query.eq("status", params.status);

  const { data: recos, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  // Compter par statut pour les pills
  const { data: statusCounts } = await supabaseAdmin
    .from("recommendations")
    .select("status");
  const countByStatus = (statusCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = statusCounts?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Recommandations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} au total</p>
        </div>
      </div>

      {/* Filtres statut — scroll horizontal sur mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        <Link
          href="/gestion-reseau/recommandations"
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            !params.status
              ? "bg-winelio-orange text-white border-winelio-orange"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Toutes
          <span className="opacity-70 text-[10px]">{totalCount}</span>
        </Link>
        {Object.entries(STATUS_LABELS).map(([s, { label, dot }]) => (
          <Link
            key={s}
            href={`/gestion-reseau/recommandations?status=${s}`}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              params.status === s
                ? "bg-winelio-orange text-white border-winelio-orange"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
            {label}
            {countByStatus[s] ? (
              <span className="opacity-60 text-[10px]">{countByStatus[s]}</span>
            ) : null}
          </Link>
        ))}
      </div>

      {/* Table desktop */}
      <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Référent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Professionnel</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statut</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Montant</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Étapes</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(recos ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  Aucune recommandation trouvée
                </td>
              </tr>
            )}
            {(recos ?? []).map((reco) => {
              const steps = reco.recommendation_steps ?? [];
              const done = steps.filter((s: { completed_at: string | null }) => s.completed_at).length;
              const st = STATUS_LABELS[reco.status] ?? { label: reco.status, color: "text-muted-foreground bg-muted border-border", dot: "bg-gray-400" };
              const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
              const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;
              const referrerName = referrer ? `${referrer.first_name ?? ""} ${referrer.last_name ?? ""}`.trim() : "—";
              const professionalName = professional ? `${professional.first_name ?? ""} ${professional.last_name ?? ""}`.trim() : "—";
              return (
                <tr key={reco.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{referrerName}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{professionalName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${st.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {reco.amount
                      ? <span className="font-semibold text-emerald-400">{Number(reco.amount).toLocaleString("fr-FR")} €</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: steps.length || 8 }, (_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-sm ${i < done ? "bg-emerald-400" : "bg-white/10"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{done}/{steps.length || 8}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(reco.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/gestion-reseau/recommandations/${reco.id}`}
                      className="text-xs font-medium text-winelio-orange hover:text-winelio-amber transition-colors"
                    >
                      Détail →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-3">
        {(recos ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">Aucune recommandation trouvée</p>
        )}
        {(recos ?? []).map((reco) => {
          const steps = reco.recommendation_steps ?? [];
          const done = steps.filter((s: { completed_at: string | null }) => s.completed_at).length;
          const st = STATUS_LABELS[reco.status] ?? { label: reco.status, color: "text-muted-foreground bg-muted border-border", dot: "bg-gray-400" };
          const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
          const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;
          const referrerName = referrer ? `${referrer.first_name ?? ""} ${referrer.last_name ?? ""}`.trim() : "—";
          const professionalName = professional ? `${professional.first_name ?? ""} ${professional.last_name ?? ""}`.trim() : "—";
          return (
            <div key={reco.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{referrerName}</p>
                  <p className="text-xs text-muted-foreground truncate">→ {professionalName}</p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${st.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {Array.from({ length: steps.length || 8 }, (_, i) => (
                    <div key={i} className={`w-4 h-1.5 rounded-sm ${i < done ? "bg-emerald-400" : "bg-white/10"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {reco.amount && (
                    <span className="text-sm font-semibold text-emerald-400">
                      {Number(reco.amount).toLocaleString("fr-FR")} €
                    </span>
                  )}
                  <Link href={`/gestion-reseau/recommandations/${reco.id}`} className="text-xs font-medium text-winelio-orange">
                    Détail →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-end flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/recommandations?page=${p}${params.status ? `&status=${params.status}` : ""}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                p === page ? "bg-winelio-orange text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
