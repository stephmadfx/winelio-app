"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tab = "sent" | "received";
type Status = "all" | "PENDING" | "QUOTE_VALIDATED" | "COMPLETED" | "CANCELLED";

interface Recommendation {
  id: string;
  status: string;
  amount: number | null;
  created_at: string;
  contact: { first_name: string; last_name: string } | null;
  professional: { first_name: string; last_name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:          "En attente",
  ACCEPTED:         "Acceptée",
  CONTACT_MADE:     "Contact établi",
  MEETING_SCHEDULED:"RDV fixé",
  QUOTE_SUBMITTED:  "Devis soumis",
  QUOTE_VALIDATED:  "Devis validé",
  PAYMENT_RECEIVED: "Paiement reçu",
  COMPLETED:        "Terminée",
  REJECTED:         "Refusée",
  EXPIRED:          "Expirée",
  TRANSFERRED:      "Transférée",
};

const STATUS_CONFIG: Record<string, {
  gradient: string; text: string; dot: string;
  pill: string; stripe: string;
}> = {
  PENDING:          { gradient: "from-amber-500/10 to-amber-500/5",   text: "text-amber-700",        dot: "bg-amber-400",         pill: "bg-amber-50 text-amber-700 ring-amber-200",        stripe: "bg-amber-400" },
  ACCEPTED:         { gradient: "from-blue-500/10 to-blue-500/5",     text: "text-blue-700",         dot: "bg-blue-400",          pill: "bg-blue-50 text-blue-700 ring-blue-200",           stripe: "bg-blue-400" },
  CONTACT_MADE:     { gradient: "from-indigo-500/10 to-indigo-500/5", text: "text-indigo-700",       dot: "bg-indigo-400",        pill: "bg-indigo-50 text-indigo-700 ring-indigo-200",     stripe: "bg-indigo-400" },
  MEETING_SCHEDULED:{ gradient: "from-violet-500/10 to-violet-500/5", text: "text-violet-700",       dot: "bg-violet-400",        pill: "bg-violet-50 text-violet-700 ring-violet-200",     stripe: "bg-violet-400" },
  QUOTE_SUBMITTED:  { gradient: "from-orange-500/10 to-orange-500/5", text: "text-kiparlo-orange",   dot: "bg-kiparlo-orange",    pill: "bg-orange-50 text-kiparlo-orange ring-orange-200", stripe: "bg-kiparlo-orange" },
  QUOTE_VALIDATED:  { gradient: "from-orange-500/15 to-amber-500/10", text: "text-kiparlo-orange",   dot: "bg-kiparlo-orange",    pill: "bg-orange-50 text-kiparlo-orange ring-orange-300", stripe: "bg-kiparlo-amber" },
  PAYMENT_RECEIVED: { gradient: "from-teal-500/10 to-teal-500/5",     text: "text-teal-700",         dot: "bg-teal-500",          pill: "bg-teal-50 text-teal-700 ring-teal-200",           stripe: "bg-teal-500" },
  COMPLETED:        { gradient: "from-green-500/10 to-emerald-500/5", text: "text-green-700",        dot: "bg-green-500",         pill: "bg-green-50 text-green-700 ring-green-200",        stripe: "bg-green-500" },
  REJECTED:         { gradient: "from-red-500/8 to-red-500/3",        text: "text-red-600",          dot: "bg-red-400",           pill: "bg-red-50 text-red-600 ring-red-200",              stripe: "bg-red-400" },
  EXPIRED:          { gradient: "from-gray-400/8 to-gray-400/3",      text: "text-gray-500",         dot: "bg-gray-300",          pill: "bg-gray-50 text-gray-500 ring-gray-200",           stripe: "bg-gray-300" },
  TRANSFERRED:      { gradient: "from-blue-400/8 to-blue-400/3",      text: "text-blue-600",         dot: "bg-blue-400",          pill: "bg-blue-50 text-blue-600 ring-blue-200",           stripe: "bg-blue-400" },
};

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-2xl bg-gradient-to-r from-gray-100 to-gray-50 animate-pulse" />
      ))}
    </div>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  const cls = size === "lg"
    ? "w-14 h-14 text-base rounded-2xl"
    : size === "sm"
      ? "w-8 h-8 text-xs rounded-xl"
      : "w-11 h-11 text-sm rounded-xl";
  return (
    <div className={`${cls} bg-gradient-to-br from-kiparlo-orange to-kiparlo-amber flex items-center justify-center shrink-0 shadow-sm shadow-kiparlo-orange/20`}>
      <span className="font-bold text-white uppercase">{init}</span>
    </div>
  );
}

const STATS_ICONS = {
  total: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  pending: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  completed: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const FILTERS: { value: Status; label: string; activeClass: string }[] = [
  { value: "all",            label: "Toutes",      activeClass: "bg-kiparlo-dark text-white shadow-sm shadow-kiparlo-dark/20" },
  { value: "PENDING",        label: "En attente",  activeClass: "bg-amber-500 text-white shadow-sm shadow-amber-500/20" },
  { value: "QUOTE_VALIDATED",label: "Validées",    activeClass: "bg-kiparlo-orange text-white shadow-sm shadow-kiparlo-orange/20" },
  { value: "COMPLETED",      label: "Terminées",   activeClass: "bg-green-500 text-white shadow-sm shadow-green-500/20" },
  { value: "CANCELLED",      label: "Annulées",    activeClass: "bg-red-400 text-white shadow-sm shadow-red-400/20" },
];

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

  return (
    <div className="">

      {/* ── Hero Header ── */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-kiparlo-dark via-[#3d4042] to-[#2D3436] px-6 py-7 sm:px-8">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-kiparlo-orange/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-kiparlo-amber/10 blur-2xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiparlo-orange/20">
                <svg className="h-4 w-4 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-kiparlo-orange/80">Mise en relation</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Recommandations</h1>
            <p className="mt-1 text-sm text-white/50">Gérez vos mises en relation et suivez vos commissions</p>
          </div>
          <Link
            href="/recommendations/new"
            className="group inline-flex items-center gap-2 rounded-xl bg-kiparlo-orange px-5 py-3 text-sm font-bold text-white shadow-lg shadow-kiparlo-orange/30 transition-all hover:bg-kiparlo-amber hover:shadow-kiparlo-amber/30 hover:-translate-y-0.5 cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle recommandation
          </Link>
        </div>

        {/* Stats row inside header */}
        {!loading && recommendations.length > 0 && (
          <div className="relative mt-6 grid grid-cols-3 gap-3">
            {[
              { key: "total",     label: "Total",      value: counts.total,     color: "text-white",        icon: STATS_ICONS.total,     bg: "bg-white/8" },
              { key: "pending",   label: "En attente", value: counts.pending,   color: "text-amber-400",    icon: STATS_ICONS.pending,   bg: "bg-amber-400/10" },
              { key: "completed", label: "Terminées",  value: counts.completed, color: "text-green-400",    icon: STATS_ICONS.completed, bg: "bg-green-400/10" },
            ].map((stat) => (
              <div key={stat.key} className={`${stat.bg} rounded-2xl px-4 py-3 backdrop-blur-sm ring-1 ring-white/8`}>
                <div className="flex items-center gap-2">
                  <div className={`${stat.color} opacity-70`}>{stat.icon}</div>
                  <p className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                </div>
                <p className="mt-0.5 text-xs font-medium text-white/40">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="mb-5 flex gap-1 rounded-2xl bg-kiparlo-light p-1.5">
        {(["sent", "received"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatusFilter("all"); }}
            className={`group relative flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 cursor-pointer ${
              tab === t
                ? "bg-white text-kiparlo-dark shadow-sm"
                : "text-kiparlo-gray hover:text-kiparlo-dark"
            }`}
          >
            {t === "sent" ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Envoyées
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                Reçues
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Status filters ── */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer ${
              statusFilter === f.value
                ? f.activeClass
                : "bg-white border border-kiparlo-gray/12 text-kiparlo-gray hover:border-kiparlo-gray/25 hover:text-kiparlo-dark"
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
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-kiparlo-gray/20 bg-white py-20 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-kiparlo-light">
            <svg className="h-10 w-10 text-kiparlo-gray/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-lg font-bold text-kiparlo-dark">Aucune recommandation</p>
          <p className="mt-2 max-w-xs text-sm text-kiparlo-gray">
            {statusFilter !== "all"
              ? "Aucune correspondance pour ce filtre. Essayez une autre catégorie."
              : "Vous n'avez encore aucune recommandation. Commencez dès maintenant !"}
          </p>
          {statusFilter === "all" && tab === "sent" && (
            <Link
              href="/recommendations/new"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kiparlo-orange px-6 py-3 text-sm font-bold text-white shadow-md shadow-kiparlo-orange/25 hover:bg-kiparlo-amber transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Créer ma première recommandation
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const cfg = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG.EXPIRED;
            const contactName = rec.contact
              ? [rec.contact.first_name, rec.contact.last_name].filter(Boolean).join(" ") || "Contact inconnu"
              : "Contact inconnu";
            const proName = rec.professional
              ? [rec.professional.first_name, rec.professional.last_name].filter(Boolean).join(" ") || "Professionnel inconnu"
              : "Professionnel inconnu";

            return (
              <Link
                key={rec.id}
                href={`/recommendations/${rec.id}`}
                className="group relative flex items-stretch rounded-2xl bg-white shadow-sm ring-1 ring-kiparlo-gray/8 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:ring-kiparlo-gray/15 overflow-hidden cursor-pointer"
              >
                {/* Left status stripe */}
                <div className={`w-1 shrink-0 ${cfg.stripe} rounded-l-2xl`} />

                {/* Main content */}
                <div className="flex flex-1 items-center gap-4 px-4 py-4 sm:px-5">
                  <Avatar name={contactName} size="md" />

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-kiparlo-dark truncate leading-tight">{contactName}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-kiparlo-gray">
                      <span className="text-kiparlo-gray/40">{tab === "sent" ? "→" : "←"}</span>
                      <span className="truncate">{proName}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-kiparlo-gray/50">
                      {new Date(rec.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {rec.amount != null && (
                      <span className="text-base font-black text-kiparlo-dark tabular-nums">
                        {rec.amount.toLocaleString("fr-FR")}&thinsp;<span className="text-sm font-semibold text-kiparlo-gray">€</span>
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cfg.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                      {STATUS_LABELS[rec.status] ?? rec.status}
                    </span>
                  </div>

                  <svg className="w-4 h-4 text-kiparlo-gray/25 group-hover:text-kiparlo-orange/60 transition-colors duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
