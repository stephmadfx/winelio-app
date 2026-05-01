// src/components/admin/FollowupTimeline.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";

interface Props {
  recommendationId: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending:    "En attente",
  sent:       "Envoyée",
  cancelled:  "Annulée",
  superseded: "Remplacée",
};

const REASON_LABEL: Record<string, string> = {
  next_step_done:    "Étape suivante complétée",
  reco_refused:      "Reco refusée",
  reco_transferred:  "Reco transférée",
  pro_inactive:      "Pro inactif",
  pro_abandoned:     "Cycle terminé",
};

export async function FollowupTimeline({ recommendationId }: Props) {
  const { data: rows } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_followups")
    .select("id, after_step_order, cycle_index, scheduled_at, status, sent_at, report_count, cancel_reason, created_at")
    .eq("recommendation_id", recommendationId)
    .order("created_at", { ascending: true });

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-500">Aucune relance programmée pour cette recommandation.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs font-mono text-gray-400 mt-0.5">
            #{row.after_step_order}.{row.cycle_index}
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-gray-900">
              Relance après étape {row.after_step_order} (cycle {row.cycle_index}/3) — {STATUS_LABEL[row.status] ?? row.status}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Programmée : {new Date(row.scheduled_at).toLocaleString("fr-FR")}
              {row.sent_at && ` · Envoyée : ${new Date(row.sent_at).toLocaleString("fr-FR")}`}
              {row.cancel_reason && ` · Raison : ${REASON_LABEL[row.cancel_reason] ?? row.cancel_reason}`}
              {row.report_count > 0 && ` · Reportée ${row.report_count}×`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
