// src/app/gestion-reseau/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InscriptionsChart,
  RecosStatusChart,
  type MonthStat,
  type StatusStat,
} from "@/components/admin/DashboardCharts";

// ─── helpers ────────────────────────────────────────────────────────────────

const FR_MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:     "En attente",
  ACCEPTED:    "Acceptée",
  IN_PROGRESS: "En cours",
  COMPLETED:   "Terminée",
  CANCELLED:   "Annulée",
};

// ─── data fetching ───────────────────────────────────────────────────────────

async function getKPIs() {
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();

  const [
    membersRes,
    earnedRes,
    pendingRes,
    ongoingRes,
    withdrawalsRes,
    winsRes,
    newMembersRes,
    prevMembersRes,
    allRecosRes,
    completedRecosRes,
    cagnotteAllRes,
    cagnotteMoisRes,
  ] = await Promise.all([
    // Membres actifs
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    // Commissions distribuées (EARNED) — hors cagnotte Winelio
    supabaseAdmin.from("commission_transactions").select("amount").eq("status", "EARNED").neq("type", "platform_winelio"),
    // Commissions en attente (PENDING) — hors cagnotte Winelio
    supabaseAdmin.from("commission_transactions").select("amount").eq("status", "PENDING").neq("type", "platform_winelio"),
    // Recommandations en cours
    supabaseAdmin.from("recommendations").select("id", { count: "exact", head: true })
      .not("status", "in", '("COMPLETED","CANCELLED")'),
    // Retraits en attente
    supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    // Total Wins distribués
    supabaseAdmin.from("user_wallet_summaries").select("total_wins"),
    // Nouveaux membres ce mois
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    // Nouveaux membres mois précédent (pour delta)
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true })
      .gte("created_at", prevMonthStart)
      .lt("created_at", monthStart),
    // Total recommandations (pour taux de conversion)
    supabaseAdmin.from("recommendations").select("id", { count: "exact", head: true }),
    // Recommandations terminées
    supabaseAdmin.from("recommendations").select("id", { count: "exact", head: true })
      .eq("status", "COMPLETED"),
    // Cagnotte Winelio — total cumulé
    supabaseAdmin.from("commission_transactions").select("amount").eq("type", "platform_winelio").eq("status", "EARNED"),
    // Cagnotte Winelio — ce mois
    supabaseAdmin.from("commission_transactions").select("amount").eq("type", "platform_winelio").eq("status", "EARNED")
      .gte("created_at", monthStart),
  ]);

  const totalEarned    = (earnedRes.data       ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalPending   = (pendingRes.data      ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalWins      = (winsRes.data         ?? []).reduce((s, w) => s + (w.total_wins ?? 0), 0);
  const cagnotteTotal  = (cagnotteAllRes.data  ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);
  const cagnotteMois   = (cagnotteMoisRes.data ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

  const newMembers  = newMembersRes.count  ?? 0;
  const prevMembers = prevMembersRes.count ?? 0;
  const membersDelta = prevMembers > 0
    ? Math.round(((newMembers - prevMembers) / prevMembers) * 100)
    : null;

  const totalRecos     = allRecosRes.count     ?? 0;
  const completedRecos = completedRecosRes.count ?? 0;
  const conversionRate = totalRecos > 0
    ? Math.round((completedRecos / totalRecos) * 100)
    : 0;

  return {
    activeMembers:     membersRes.count ?? 0,
    totalEarned,
    totalPending,
    ongoingRecos:      ongoingRes.count ?? 0,
    pendingWithdrawals: withdrawalsRes.count ?? 0,
    totalWins:         Math.round(totalWins),
    newMembers,
    membersDelta,
    conversionRate,
    completedRecos,
    totalRecos,
    cagnotteTotal,
    cagnotteMois,
  };
}

async function getChartData(): Promise<{ inscriptions: MonthStat[]; recosStatus: StatusStat[] }> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const [profilesRes, recosRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("created_at")
      .gte("created_at", twelveMonthsAgo.toISOString()),
    supabaseAdmin
      .from("recommendations")
      .select("status"),
  ]);

  // ── inscriptions par mois ──────────────────────────────────────────────────
  const now = new Date();
  const inscriptions: MonthStat[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return { month: FR_MONTHS[d.getMonth()], count: 0, _key: `${d.getFullYear()}-${d.getMonth()}` };
  }) as (MonthStat & { _key: string })[];

  for (const p of profilesRes.data ?? []) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const slot = (inscriptions as (MonthStat & { _key: string })[]).find((s) => s._key === key);
    if (slot) slot.count++;
  }
  // remove internal _key before passing to client
  const inscriptionsClean: MonthStat[] = inscriptions.map(({ month, count }) => ({ month, count }));

  // ── statuts recommandations ────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {};
  for (const r of recosRes.data ?? []) {
    const label = STATUS_LABELS[r.status] ?? r.status ?? "Inconnu";
    statusCounts[label] = (statusCounts[label] ?? 0) + 1;
  }
  const recosStatus: StatusStat[] = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    color: "",
  }));

  return { inscriptions: inscriptionsClean, recosStatus };
}

// ─── composants de carte ─────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  bg,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl p-5 ${bg} border border-white/5`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function AdminDashboard() {
  const [kpis, charts] = await Promise.all([getKPIs(), getChartData()]);

  const row1 = [
    {
      label: "Membres actifs",
      value: kpis.activeMembers.toLocaleString("fr-FR"),
      color: "text-winelio-orange",
      bg: "bg-orange-500/10",
    },
    {
      label: "Commissions distribuées",
      value: `${kpis.totalEarned.toLocaleString("fr-FR")} €`,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Recommandations en cours",
      value: kpis.ongoingRecos.toLocaleString("fr-FR"),
      color: "text-winelio-amber",
      bg: "bg-amber-500/10",
    },
    {
      label: "Retraits en attente",
      value: kpis.pendingWithdrawals.toLocaleString("fr-FR"),
      color: kpis.pendingWithdrawals > 0 ? "text-red-400" : "text-gray-400",
      bg: kpis.pendingWithdrawals > 0 ? "bg-red-500/10" : "bg-white/5",
    },
  ];

  const deltaLabel = kpis.membersDelta !== null
    ? kpis.membersDelta >= 0
      ? `↑ ${kpis.membersDelta}% vs mois dernier`
      : `↓ ${Math.abs(kpis.membersDelta)}% vs mois dernier`
    : undefined;

  const row2 = [
    {
      label: "Commissions en attente",
      value: `${kpis.totalPending.toLocaleString("fr-FR")} €`,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      sub: "Gains non encore versés",
    },
    {
      label: "Total Wins distribués",
      value: kpis.totalWins.toLocaleString("fr-FR"),
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      sub: "Monnaie interne plateforme",
    },
    {
      label: "Nouveaux membres ce mois",
      value: kpis.newMembers.toLocaleString("fr-FR"),
      color: "text-sky-400",
      bg: "bg-sky-500/10",
      sub: deltaLabel,
    },
    {
      label: "Taux de conversion",
      value: `${kpis.conversionRate} %`,
      color: "text-emerald-300",
      bg: "bg-emerald-500/5",
      sub: `${kpis.completedRecos} / ${kpis.totalRecos} recos terminées`,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      {/* Cagnotte Winelio */}
      <div className="rounded-xl p-5 bg-gradient-to-r from-amber-500/20 to-winelio-orange/20 border border-winelio-orange/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-winelio-orange uppercase tracking-widest mb-1">
            💰 Cagnotte Winelio (14 %)
          </p>
          <p className="text-3xl font-bold text-white">
            {kpis.cagnotteTotal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </p>
          <p className="text-xs text-gray-400 mt-1">Total cumulé — revenus plateforme</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-0.5">Ce mois</p>
          <p className="text-xl font-bold text-winelio-amber">
            + {kpis.cagnotteMois.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </p>
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {row1.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {row2.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white/5 border-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-300">
              Inscriptions — 12 derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InscriptionsChart data={charts.inscriptions} />
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-300">
              Répartition des recommandations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecosStatusChart data={charts.recosStatus} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
