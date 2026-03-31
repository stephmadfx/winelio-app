import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:           { label: "En attente",         color: "text-yellow-400 bg-yellow-400/10" },
  ACCEPTED:          { label: "Acceptée",            color: "text-blue-400 bg-blue-400/10" },
  CONTACT_MADE:      { label: "Contact établi",      color: "text-indigo-400 bg-indigo-400/10" },
  MEETING_SCHEDULED: { label: "RDV fixé",            color: "text-purple-400 bg-purple-400/10" },
  QUOTE_SUBMITTED:   { label: "Devis soumis",        color: "text-orange-400 bg-orange-400/10" },
  QUOTE_VALIDATED:   { label: "Devis validé",        color: "text-kiparlo-amber bg-amber-400/10" },
  PAYMENT_RECEIVED:  { label: "Paiement reçu",       color: "text-emerald-300 bg-emerald-300/10" },
  COMPLETED:         { label: "Terminée",            color: "text-emerald-400 bg-emerald-400/10" },
  CANCELLED:         { label: "Annulée",             color: "text-red-400 bg-red-400/10" },
};

const FILTER_STATUSES = ["", ...Object.keys(STATUS_LABELS)];

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
      `id, status, deal_amount, created_at,
       referrer:profiles!referrer_id(first_name, last_name),
       professional:profiles!professional_id(first_name, last_name),
       recommendation_steps(step_order, completed)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.status) query = query.eq("status", params.status);

  const { data: recos, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Recommandations</h1>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/gestion-reseau/recommandations${s ? `?status=${s}` : ""}`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              (params.status ?? "") === s
                ? "bg-kiparlo-orange text-white"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {s === "" ? "Toutes" : STATUS_LABELS[s]?.label ?? s}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Referrer</th>
              <th className="text-left px-4 py-3">Professionnel</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-left px-4 py-3">Montant</th>
              <th className="text-left px-4 py-3">Étape</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(recos ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Aucune recommandation trouvée.
                </td>
              </tr>
            )}
            {(recos ?? []).map((reco) => {
              const steps = reco.recommendation_steps ?? [];
              const completedSteps = steps.filter((s: { completed: boolean }) => s.completed).length;
              const st = STATUS_LABELS[reco.status] ?? { label: reco.status, color: "text-gray-400 bg-white/5" };
              const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
              const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;
              const referrerName = referrer ? `${referrer.first_name ?? ""} ${referrer.last_name ?? ""}`.trim() : "—";
              const professionalName = professional ? `${professional.first_name ?? ""} ${professional.last_name ?? ""}`.trim() : "—";
              return (
                <tr key={reco.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white">{referrerName}</td>
                  <td className="px-4 py-3 text-gray-300">{professionalName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-emerald-400">
                    {reco.deal_amount ? `${Number(reco.deal_amount).toLocaleString("fr-FR")} €` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {completedSteps}/{steps.length}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/gestion-reseau/recommandations/${reco.id}`}
                      className="text-kiparlo-orange text-xs hover:underline"
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-end">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/gestion-reseau/recommandations?page=${p}${params.status ? `&status=${params.status}` : ""}`}
              className={`px-3 py-1 rounded text-xs ${
                p === page
                  ? "bg-kiparlo-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-white"
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
