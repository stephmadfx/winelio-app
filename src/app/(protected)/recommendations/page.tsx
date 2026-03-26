"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tab = "sent" | "received";
type Status = "all" | "pending" | "in_progress" | "completed" | "cancelled";

interface Recommendation {
  id: string;
  status: string;
  deal_amount: number | null;
  created_at: string;
  contact: { first_name: string; last_name: string } | null;
  professional: { first_name: string; last_name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-kiparlo-orange/15 text-kiparlo-orange",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function RecommendationsPage() {
  const [tab, setTab] = useState<Tab>("sent");
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;

    async function fetchRecommendations() {
      setLoading(true);

      const column = tab === "sent" ? "referrer_id" : "professional_id";

      let query = supabase
        .from("recommendations")
        .select(
          "id, status, deal_amount, created_at, contact:contacts(first_name, last_name), professional:profiles!recommendations_professional_id_fkey(first_name, last_name)"
        )
        .eq(column, userId!)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data } = await query;

      setRecommendations(
        (data ?? []).map((r) => ({
          ...r,
          contact: Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact,
          professional: Array.isArray(r.professional)
            ? r.professional[0] ?? null
            : r.professional,
        })) as Recommendation[]
      );
      setLoading(false);
    }

    fetchRecommendations();
  }, [userId, tab, statusFilter, supabase]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-kiparlo-dark">
          Recommandations
        </h1>
        <Link
          href="/recommendations/new"
          className="rounded-lg bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-kiparlo-amber"
        >
          + Nouvelle recommandation
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-kiparlo-light p-1">
        {(["sent", "received"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-kiparlo-dark shadow-sm"
                : "text-kiparlo-gray hover:text-kiparlo-dark"
            }`}
          >
            {t === "sent" ? "Envoyees" : "Recues"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-2">
        {(["all", "pending", "in_progress", "completed", "cancelled"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-kiparlo-dark text-white"
                  : "bg-kiparlo-light text-kiparlo-gray hover:bg-kiparlo-gray/10"
              }`}
            >
              {s === "all" ? "Tous" : STATUS_LABELS[s]}
            </button>
          )
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-kiparlo-gray">
          Chargement...
        </div>
      ) : recommendations.length === 0 ? (
        <div className="rounded-xl border border-kiparlo-gray/10 bg-white py-16 text-center">
          <p className="text-kiparlo-gray">Aucune recommandation trouvee</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <Link
              key={rec.id}
              href={`/recommendations/${rec.id}`}
              className="block rounded-xl border border-kiparlo-gray/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-kiparlo-dark">
                    {rec.contact
                      ? `${rec.contact.first_name} ${rec.contact.last_name}`
                      : "Contact inconnu"}
                  </p>
                  <p className="mt-0.5 text-sm text-kiparlo-gray">
                    {tab === "sent" ? "Vers" : "De"}{" "}
                    {rec.professional
                      ? `${rec.professional.first_name} ${rec.professional.last_name}`
                      : "Professionnel inconnu"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {rec.deal_amount != null && (
                    <span className="text-sm font-semibold text-kiparlo-dark">
                      {rec.deal_amount.toLocaleString("fr-FR")} EUR
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[rec.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {STATUS_LABELS[rec.status] ?? rec.status}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs text-kiparlo-gray/60">
                {new Date(rec.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
