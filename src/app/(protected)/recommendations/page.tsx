"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tab = "sent" | "received";
type Status = "all" | "PENDING" | "VALIDATED" | "COMPLETED" | "CANCELLED";

interface Recommendation {
  id: string;
  status: string;
  amount: number | null;
  created_at: string;
  contact: { first_name: string; last_name: string } | null;
  professional: { first_name: string; last_name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validée",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
  TRANSFERRED: "Transférée",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  PENDING:     { bg: "bg-amber-50",   text: "text-amber-700",  border: "border-l-amber-400",  dot: "bg-amber-400" },
  VALIDATED:   { bg: "bg-orange-50",  text: "text-kiparlo-orange", border: "border-l-kiparlo-orange", dot: "bg-kiparlo-orange" },
  COMPLETED:   { bg: "bg-green-50",   text: "text-green-700",  border: "border-l-green-500",  dot: "bg-green-500" },
  CANCELLED:   { bg: "bg-red-50",     text: "text-red-600",    border: "border-l-red-400",    dot: "bg-red-400" },
  REJECTED:    { bg: "bg-red-50",     text: "text-red-600",    border: "border-l-red-400",    dot: "bg-red-400" },
  EXPIRED:     { bg: "bg-gray-50",    text: "text-gray-500",   border: "border-l-gray-300",   dot: "bg-gray-300" },
  TRANSFERRED: { bg: "bg-blue-50",    text: "text-blue-600",   border: "border-l-blue-400",   dot: "bg-blue-400" },
};

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl bg-kiparlo-gray/8 animate-pulse border-l-4 border-l-kiparlo-gray/10" />
      ))}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-kiparlo-orange to-kiparlo-amber flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-white uppercase">{init}</span>
    </div>
  );
}

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
          "id, status, amount, created_at, contact:contacts(first_name, last_name), professional:profiles!recommendations_professional_id_fkey(first_name, last_name)"
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

  const counts = {
    total: recommendations.length,
    pending: recommendations.filter((r) => r.status === "PENDING").length,
    completed: recommendations.filter((r) => r.status === "COMPLETED").length,
  };

  const FILTERS: { value: Status; label: string }[] = [
    { value: "all", label: "Toutes" },
    { value: "PENDING", label: "En attente" },
    { value: "VALIDATED", label: "Validées" },
    { value: "COMPLETED", label: "Terminées" },
    { value: "CANCELLED", label: "Annulées" },
  ];

  return (
    <div className="mx-auto max-w-4xl">

      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-kiparlo-dark tracking-tight">Recommandations</h1>
          <p className="mt-1 text-sm text-kiparlo-gray">Gérez vos mises en relation et suivez vos commissions</p>
        </div>
        <Link
          href="/recommendations/new"
          className="inline-flex items-center gap-2 rounded-xl bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-kiparlo-orange/25 transition-all hover:bg-kiparlo-amber hover:shadow-kiparlo-amber/30 hover:-translate-y-0.5 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle recommandation
        </Link>
      </div>

      {/* ── Stats bar ── */}
      {!loading && recommendations.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: counts.total, color: "text-kiparlo-dark" },
            { label: "En attente", value: counts.pending, color: "text-amber-600" },
            { label: "Terminées", value: counts.completed, color: "text-green-600" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-kiparlo-gray/10 bg-white p-4 text-center shadow-sm">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-0.5 text-xs text-kiparlo-gray">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="mb-5 flex gap-1.5 rounded-2xl bg-kiparlo-light p-1.5">
        {(["sent", "received"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatusFilter("all"); }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
              tab === t
                ? "bg-white text-kiparlo-dark shadow-sm"
                : "text-kiparlo-gray hover:text-kiparlo-dark"
            }`}
          >
            {t === "sent" ? "Envoyées" : "Reçues"}
          </button>
        ))}
      </div>

      {/* ── Status filters ── */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              statusFilter === f.value
                ? "bg-kiparlo-dark text-white shadow-sm"
                : "bg-white border border-kiparlo-gray/15 text-kiparlo-gray hover:border-kiparlo-gray/30 hover:text-kiparlo-dark"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <Skeleton />
      ) : recommendations.length === 0 ? (
        <div className="rounded-2xl border border-kiparlo-gray/10 bg-white py-20 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-kiparlo-light">
            <svg className="h-7 w-7 text-kiparlo-gray/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="font-semibold text-kiparlo-dark">Aucune recommandation</p>
          <p className="mt-1 text-sm text-kiparlo-gray">
            {statusFilter !== "all" ? "Modifiez le filtre pour voir plus de résultats." : "Commencez par créer votre première recommandation."}
          </p>
          {statusFilter === "all" && tab === "sent" && (
            <Link
              href="/recommendations/new"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-kiparlo-amber transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Créer une recommandation
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const cfg = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG.EXPIRED;
            const contactName = rec.contact
              ? `${rec.contact.first_name} ${rec.contact.last_name}`
              : "Contact inconnu";
            const proName = rec.professional
              ? `${rec.professional.first_name} ${rec.professional.last_name}`
              : "Professionnel inconnu";

            return (
              <Link
                key={rec.id}
                href={`/recommendations/${rec.id}`}
                className={`group flex items-center gap-4 rounded-2xl border border-kiparlo-gray/10 bg-white p-4 sm:p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 border-l-4 ${cfg.border} cursor-pointer`}
              >
                <Initials name={contactName} />

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-kiparlo-dark truncate">{contactName}</p>
                  <p className="mt-0.5 text-sm text-kiparlo-gray truncate">
                    {tab === "sent" ? "→" : "←"} {proName}
                  </p>
                  <p className="mt-1 text-xs text-kiparlo-gray/60">
                    {new Date(rec.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {rec.amount != null && (
                    <span className="text-sm font-bold text-kiparlo-dark tabular-nums">
                      {rec.amount.toLocaleString("fr-FR")} €
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                    {STATUS_LABELS[rec.status] ?? rec.status}
                  </span>
                </div>

                <svg className="w-4 h-4 text-kiparlo-gray/30 group-hover:text-kiparlo-gray/60 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
