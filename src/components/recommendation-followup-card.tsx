// src/components/recommendation-followup-card.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FollowupRow {
  id: string;
  after_step_order: number;
  cycle_index: number;
  scheduled_at: string;
  report_count: number;
}

interface Props {
  recommendationId: string;
  isProfessional: boolean;
}

const STEP_LABEL: Record<number, string> = {
  2: "prendre contact",
  4: "soumettre le devis",
  5: "finaliser les travaux",
};

export function RecommendationFollowupCard({ recommendationId, isProfessional }: Props) {
  const [followup, setFollowup] = useState<FollowupRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isProfessional) { setLoading(false); return; }
    const supabase = createClient();
    supabase
      .schema("winelio")
      .from("recommendation_followups")
      .select("id, after_step_order, cycle_index, scheduled_at, report_count")
      .eq("recommendation_id", recommendationId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setFollowup(data);
        setLoading(false);
      });
  }, [recommendationId, isProfessional]);

  if (loading || !followup || !isProfessional) return null;

  const daysUntil = Math.max(0, Math.round((new Date(followup.scheduled_at).getTime() - Date.now()) / 86_400_000));
  const action = STEP_LABEL[followup.after_step_order] ?? "avancer";

  return (
    <div className="mb-4 rounded-xl border border-winelio-orange/20 bg-winelio-orange/5 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔔</div>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-winelio-dark">
            Prochaine relance dans {daysUntil} jour{daysUntil > 1 ? "s" : ""} (cycle {followup.cycle_index}/3)
          </p>
          <p className="text-xs text-winelio-gray mt-1">
            Pensez à {action} pour faire avancer cette recommandation.
            {followup.report_count > 0 && ` Reportée ${followup.report_count} fois (5 max).`}
          </p>
        </div>
      </div>
    </div>
  );
}
