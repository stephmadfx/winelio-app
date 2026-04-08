"use client";

import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Tab = "sent" | "received";
type Status = "all" | "PENDING" | "QUOTE_VALIDATED" | "COMPLETED" | "CANCELLED";

interface Recommendation {
  id: string;
  status: string;
  amount: number | null;
  created_at: string;
  contact: { first_name: string; last_name: string } | null;
  professional: {
    first_name: string | null;
    last_name: string | null;
    companies: { alias: string | null; city: string | null; category: { name: string } | null } | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:           "En attente",
  ACCEPTED:          "Acceptée",
  CONTACT_MADE:      "Contact établi",
  MEETING_SCHEDULED: "RDV fixé",
  QUOTE_SUBMITTED:   "Devis soumis",
  QUOTE_VALIDATED:   "Devis validé",
  PAYMENT_RECEIVED:  "Paiement reçu",
  COMPLETED:         "Terminée",
  REJECTED:          "Refusée",
  EXPIRED:           "Expirée",
  TRANSFERRED:       "Transférée",
};

const STATUS_CONFIG: Record<string, {
  text: string; dot: string; pill: string; stripe: string;
}> = {
  PENDING:           { text: "text-amber-700",       dot: "bg-amber-400",      pill: "bg-amber-50 text-amber-700 ring-amber-200",        stripe: "bg-amber-400" },
  ACCEPTED:          { text: "text-blue-700",         dot: "bg-blue-400",       pill: "bg-blue-50 text-blue-700 ring-blue-200",           stripe: "bg-blue-400" },
  CONTACT_MADE:      { text: "text-indigo-700",       dot: "bg-indigo-400",     pill: "bg-indigo-50 text-indigo-700 ring-indigo-200",     stripe: "bg-indigo-400" },
  MEETING_SCHEDULED: { text: "text-violet-700",       dot: "bg-violet-400",     pill: "bg-violet-50 text-violet-700 ring-violet-200",     stripe: "bg-violet-400" },
  QUOTE_SUBMITTED:   { text: "text-winelio-orange",   dot: "bg-winelio-orange", pill: "bg-orange-50 text-winelio-orange ring-orange-200", stripe: "bg-winelio-orange" },
  QUOTE_VALIDATED:   { text: "text-winelio-orange",   dot: "bg-winelio-orange", pill: "bg-orange-50 text-winelio-orange ring-orange-300", stripe: "bg-winelio-amber" },
  PAYMENT_RECEIVED:  { text: "text-teal-700",         dot: "bg-teal-500",       pill: "bg-teal-50 text-teal-700 ring-teal-200",           stripe: "bg-teal-500" },
  COMPLETED:         { text: "text-green-700",        dot: "bg-green-500",      pill: "bg-green-50 text-green-700 ring-green-200",        stripe: "bg-green-500" },
  REJECTED:          { text: "text-red-600",          dot: "bg-red-400",        pill: "bg-red-50 text-red-600 ring-red-200",              stripe: "bg-red-400" },
  EXPIRED:           { text: "text-gray-500",         dot: "bg-gray-300",       pill: "bg-gray-50 text-gray-500 ring-gray-200",           stripe: "bg-gray-300" },
  TRANSFERRED:       { text: "text-blue-600",         dot: "bg-blue-400",       pill: "bg-blue-50 text-blue-600 ring-blue-200",           stripe: "bg-blue-400" },
};

// Status values that match the "Annulées" filter
const CANCELLED_STATUSES = ["REJECTED", "EXPIRED", "TRANSFERRED"];

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-2xl bg-gradient-to-r from-gray-100 to-gray-50 animate-pulse" />
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2);
  return (
    <div className="w-11 h-11 text-sm rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shrink-0 shadow-sm shadow-winelio-orange/20">
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
  { value: "all",             label: "Toutes",     activeClass: "bg-winelio-dark text-white shadow-sm shadow-winelio-dark/20" },
  { value: "PENDING",         label: "En attente", activeClass: "bg-amber-500 text-white shadow-sm shadow-amber-500/20" },
  { value: "QUOTE_VALIDATED", label: "Validées",   activeClass: "bg-winelio-orange text-white shadow-sm shadow-winelio-orange/20" },
  { value: "COMPLETED",       label: "Terminées",  activeClass: "bg-green-500 text-white shadow-sm shadow-green-500/20" },
  { value: "CANCELLED",       label: "Annulées",   activeClass: "bg-red-400 text-white shadow-sm shadow-red-400/20" },
];

export default function RecommendationsPage() {
  const [tab, setTab] = useState<Tab>("sent");
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  // allRecommendations: always the full unfiltered list for the current tab
  const [allRecommendations, setAllRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [supabase]);

  // Fetch ALL recommendations for current tab — no status filter in query
  useEffect(() => {
    if (!userId) return;

    async function fetchRecommendations() {
      setLoading(true);
      const column = tab === "sent" ? "referrer_id" : "professional_id";
      const { data } = await supabase
        .from("recommendations")
        .select(
          `id, status, amount, created_at,
 contact:contacts(first_name, last_name),
 professional:profiles!recommendations_professional_id_fkey(
   first_name, last_name,
   companies!owner_id(alias, city, category:categories(name))
 )`
        )
        .eq(column, userId!)
        .order("created_at", { ascending: false });

      setAllRecommendations(
        (data ?? []).map((r) => {
          const pro = Array.isArray(r.professional) ? r.professional[0] ?? null : r.professional;
          const rawCompany = pro ? (Array.isArray(pro.companies) ? pro.companies[0] ?? null : pro.companies) : null;
          const rawCat = rawCompany?.category;
          const companyNormalized = rawCompany ? {
            alias: rawCompany.alias ?? null,
            city: rawCompany.city ?? null,
            category: Array.isArray(rawCat) ? (rawCat[0] ?? null) : (rawCat ?? null),
          } : null;
          return {
            ...r,
            contact: Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact,
            professional: pro ? { ...pro, companies: companyNormalized } : null,
          };
        }) as Recommendation[]
      );
      setLoading(false);
    }

    fetchRecommendations();
  }, [userId, tab, supabase]);

  // Counts always derived from the full unfiltered list
  const counts = useMemo(() => ({
    total:     allRecommendations.length,
    pending:   allRecommendations.filter((r) => r.status === "PENDING").length,
    completed: allRecommendations.filter((r) => r.status === "COMPLETED").length,
  }), [allRecommendations]);

  // Filtered list for display only
  const visibleRecommendations = useMemo(() => {
    if (statusFilter === "all") return allRecommendations;
    if (statusFilter === "CANCELLED") {
      return allRecommendations.filter((r) => CANCELLED_STATUSES.includes(r.status));
    }
    return allRecommendations.filter((r) => r.status === statusFilter);
  }, [allRecommendations, statusFilter]);

  return (
    <div className="">

      {/* ── Hero Header ── */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-winelio-dark via-[#3d4042] to-[#2D3436] px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-winelio-orange/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-winelio-amber/10 blur-2xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-winelio-orange/20">
                <svg className="h-4 w-4 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-winelio-orange/80">Mise en relation</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Recommandations</h1>
            <p className="mt-1 text-sm text-white/50">Gérez vos mises en relation et suivez vos commissions</p>
          </div>
          <Link
            href="/recommendations/new"
            className="group inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-5 py-3 text-sm font-bold text-white shadow-lg shadow-winelio-orange/30 transition-all hover:bg-winelio-amber hover:shadow-winelio-amber/30 hover:-translate-y-0.5 cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle recommandation
          </Link>
        </div>

        {/* Stats — always show counts from full unfiltered list */}
        {!loading && allRecommendations.length > 0 && (
          <div className="relative mt-6 grid grid-cols-3 gap-3">
            {[
              { key: "total",     label: "Total",      value: counts.total,     color: "text-white",     icon: STATS_ICONS.total,     bg: "bg-white/8" },
              { key: "pending",   label: "En attente", value: counts.pending,   color: "text-amber-400", icon: STATS_ICONS.pending,   bg: "bg-amber-400/10" },
              { key: "completed", label: "Terminées",  value: counts.completed, color: "text-green-400", icon: STATS_ICONS.completed, bg: "bg-green-400/10" },
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

      {/* ── Tabs Envoyées / Reçues ── */}
      <div className="mb-5 flex gap-1 rounded-2xl bg-winelio-light dark:bg-muted p-1.5">
        {(["sent", "received"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatusFilter("all"); }}
            className={`group relative flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 cursor-pointer ${
              tab === t
                ? "bg-white dark:bg-card text-winelio-dark dark:text-foreground shadow-sm"
                : "text-winelio-gray dark:text-muted-foreground hover:text-winelio-dark dark:hover:text-foreground"
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
                : "bg-white dark:bg-card border border-winelio-gray/12 dark:border-border text-winelio-gray dark:text-muted-foreground hover:border-winelio-gray/25 hover:text-winelio-dark dark:hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <Skeleton />
      ) : visibleRecommendations.length === 0 ? (
        <Card className="py-20 text-center items-center justify-center">
          <CardContent className="flex flex-col items-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-winelio-light dark:bg-muted">
              <svg className="h-10 w-10 text-winelio-gray/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-winelio-dark dark:text-foreground">Aucune recommandation</p>
            <p className="mt-2 max-w-xs text-sm text-winelio-gray dark:text-muted-foreground">
              {statusFilter !== "all"
                ? "Aucune correspondance pour ce filtre. Essayez une autre catégorie."
                : "Vous n'avez encore aucune recommandation. Commencez dès maintenant !"}
            </p>
            {statusFilter === "all" && tab === "sent" && (
              <Link
                href="/recommendations/new"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-winelio-orange px-6 py-3 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 hover:bg-winelio-amber transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Créer ma première recommandation
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRecommendations.map((rec) => {
            const cfg = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG.EXPIRED;
            const contactName = rec.contact
              ? [rec.contact.first_name, rec.contact.last_name].filter(Boolean).join(" ") || "Contact inconnu"
              : "Contact inconnu";
            const proAlias = rec.professional?.companies?.alias;
            const proCategory = rec.professional?.companies?.category?.name;
            const proCity = rec.professional?.companies?.city;
            const proDisplay = proAlias ?? "Professionnel inconnu";
            const proSub = [proCategory, proCity].filter(Boolean).join(" · ");

            return (
              <Link
                key={rec.id}
                href={`/recommendations/${rec.id}`}
                className="group block"
              >
                <Card className="!rounded-2xl !gap-0 !py-0 overflow-hidden ring-1 ring-winelio-gray/8 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:ring-winelio-gray/15 cursor-pointer">
                  <CardContent className="!px-0 flex items-stretch">
                    {/* Left status stripe */}
                    <div className={`w-1 shrink-0 ${cfg.stripe} rounded-l-2xl`} />

                    {/* Main content */}
                    <div className="flex flex-1 items-center gap-4 px-4 py-4 sm:px-5">
                      <Avatar name={contactName} />

                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-winelio-dark dark:text-foreground truncate leading-tight">{contactName}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-winelio-gray dark:text-muted-foreground">
                          <span className="text-winelio-gray/40">{tab === "sent" ? "→" : "←"}</span>
                          <span className="truncate font-mono font-semibold text-winelio-orange">{proDisplay}</span>
                          {proSub && <span className="text-[10px] text-winelio-gray/70 ml-1">{proSub}</span>}
                        </div>
                        <p className="mt-1.5 text-xs text-winelio-gray/50">
                          {new Date(rec.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {rec.amount != null && (
                          <span className="text-base font-black text-winelio-dark dark:text-foreground tabular-nums">
                            {rec.amount.toLocaleString("fr-FR")}&thinsp;<span className="text-sm font-semibold text-winelio-gray">€</span>
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cfg.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {STATUS_LABELS[rec.status] ?? rec.status}
                        </span>
                      </div>

                      <svg className="w-4 h-4 text-winelio-gray/25 group-hover:text-winelio-orange/60 transition-colors duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
