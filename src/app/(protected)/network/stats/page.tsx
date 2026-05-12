import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface LevelStat {
  level: number;
  filleuls: number;
  transactions: number;
  earned: number;
  pending: number;
}

interface CommissionRecord {
  id: string;
  amount: number;
  level: number;
  status: string;
  created_at: string;
  description: string | null;
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Filleuls directs",
  2: "Niveau 2",
  3: "Niveau 3",
  4: "Niveau 4",
  5: "Niveau 5",
};

const LEVEL_BAR_COLORS: Record<number, string> = {
  1: "from-winelio-orange to-winelio-amber",
  2: "from-winelio-amber to-yellow-400",
  3: "from-yellow-400 to-yellow-300",
  4: "from-emerald-500 to-emerald-400",
  5: "from-blue-500 to-blue-400",
};

const LEVEL_BADGE_COLORS: Record<number, string> = {
  1: "bg-gradient-to-r from-winelio-orange to-winelio-amber",
  2: "bg-gradient-to-r from-winelio-amber to-yellow-400",
  3: "bg-gradient-to-r from-yellow-400 to-yellow-300",
  4: "bg-gradient-to-r from-emerald-500 to-emerald-400",
  5: "bg-gradient-to-r from-blue-500 to-blue-400",
};

function fmtEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export default async function NetworkStatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // 1. Toutes les commissions du user en une seule requête (level 1-5)
  const { data: commissionsRaw } = await supabase
    .from("commission_transactions")
    .select("id, amount, level, status, created_at, description")
    .eq("user_id", user.id)
    .not("level", "is", null)
    .order("created_at", { ascending: false });

  const allCommissions: CommissionRecord[] = (commissionsRaw ?? []).map((c) => ({
    id: c.id,
    amount: Number(c.amount ?? 0),
    level: c.level ?? 0,
    status: String(c.status ?? "").toUpperCase(),
    created_at: c.created_at,
    description: c.description ?? null,
  }));

  // 2. Vrais filleuls par niveau (recursive CTE côté DB)
  const { data: networkRows } = await supabase.rpc("network_members_by_level", {
    p_user_id: user.id,
    p_max_level: 5,
  });
  const filleulsByLevel = new Map<number, number>();
  for (const row of (networkRows ?? []) as Array<{ level: number; member_count: number }>) {
    filleulsByLevel.set(row.level, row.member_count);
  }

  // 3. Agrégation par niveau (en JS, pas de N+1)
  const levelStats: LevelStat[] = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    const levelCommissions = allCommissions.filter((c) => c.level === lvl);
    levelStats.push({
      level: lvl,
      filleuls: filleulsByLevel.get(lvl) ?? 0,
      transactions: levelCommissions.length,
      earned: levelCommissions
        .filter((c) => c.status === "EARNED")
        .reduce((s, c) => s + c.amount, 0),
      pending: levelCommissions
        .filter((c) => c.status === "PENDING")
        .reduce((s, c) => s + c.amount, 0),
    });
  }

  const totalEarned = levelStats.reduce((s, l) => s + l.earned, 0);
  const totalPending = levelStats.reduce((s, l) => s + l.pending, 0);
  const totalFilleuls = levelStats.reduce((s, l) => s + l.filleuls, 0);
  const maxEarned = Math.max(...levelStats.map((l) => l.earned), 1);

  return (
    <div className="pb-24 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">
            Statistiques réseau détaillées
          </h2>
          <p className="text-sm text-winelio-gray mt-1">
            Vue complète de vos commissions par niveau de parrainage.
          </p>
        </div>
        <Link
          href="/network"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-winelio-orange hover:text-winelio-amber transition-colors self-start sm:self-auto"
        >
          ← Retour au réseau
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Card className="!rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium text-winelio-gray uppercase tracking-wider">Touché</p>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums bg-gradient-to-r from-winelio-orange to-winelio-amber bg-clip-text text-transparent mt-1 break-all">
              {fmtEur(totalEarned)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Commissions versées</p>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium text-winelio-gray uppercase tracking-wider">En attente</p>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-winelio-dark mt-1 break-all">
              {fmtEur(totalPending)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pas encore versées</p>
          </CardContent>
        </Card>
        <Card className="!rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium text-winelio-gray uppercase tracking-wider">Filleuls</p>
            <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-winelio-dark mt-1">
              {totalFilleuls}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Sur 5 niveaux</p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile : cards par niveau ─ Desktop : tableau */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-winelio-dark mb-4 sm:mb-6">
            Détail par niveau
          </h3>

          {/* Mobile : liste de cards */}
          <div className="md:hidden space-y-3">
            {levelStats.map((stat) => (
              <div key={stat.level} className="rounded-xl bg-muted/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white ${LEVEL_BADGE_COLORS[stat.level]}`}>
                      {stat.level}
                    </span>
                    <span className="font-semibold text-winelio-dark text-sm">
                      {LEVEL_LABELS[stat.level]}
                    </span>
                  </div>
                  <span className="text-xs text-winelio-gray tabular-nums">{stat.filleuls} filleul{stat.filleuls > 1 ? "s" : ""}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-winelio-gray">Transactions</p>
                    <p className="font-semibold text-winelio-dark tabular-nums">{stat.transactions}</p>
                  </div>
                  <div>
                    <p className="text-winelio-gray">Touché</p>
                    <p className="font-bold text-winelio-orange tabular-nums">{fmtEur(stat.earned)}</p>
                  </div>
                  <div>
                    <p className="text-winelio-gray">En attente</p>
                    <p className="font-semibold text-winelio-dark tabular-nums">{fmtEur(stat.pending)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop : tableau */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-winelio-gray py-3 pr-4">Niveau</th>
                  <th className="text-center text-sm font-medium text-winelio-gray py-3 px-4">Filleuls</th>
                  <th className="text-center text-sm font-medium text-winelio-gray py-3 px-4">Transactions</th>
                  <th className="text-right text-sm font-medium text-winelio-gray py-3 px-4">Touché</th>
                  <th className="text-right text-sm font-medium text-winelio-gray py-3 pl-4">En attente</th>
                </tr>
              </thead>
              <tbody>
                {levelStats.map((stat) => (
                  <tr key={stat.level} className="border-b border-gray-100 last:border-0">
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white ${LEVEL_BADGE_COLORS[stat.level]}`}>
                          {stat.level}
                        </span>
                        <span className="font-medium text-winelio-dark text-sm">{LEVEL_LABELS[stat.level]}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-semibold text-winelio-dark tabular-nums">{stat.filleuls}</td>
                    <td className="py-4 px-4 text-center font-semibold text-winelio-dark tabular-nums">{stat.transactions}</td>
                    <td className="py-4 px-4 text-right font-bold text-winelio-orange tabular-nums">{fmtEur(stat.earned)}</td>
                    <td className="py-4 pl-4 text-right font-semibold text-winelio-dark tabular-nums">{fmtEur(stat.pending)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-4 pr-4 font-bold text-winelio-dark">Total</td>
                  <td className="py-4 px-4 text-center font-bold text-winelio-dark tabular-nums">{totalFilleuls}</td>
                  <td className="py-4 px-4 text-center font-bold text-winelio-dark tabular-nums">{levelStats.reduce((s, l) => s + l.transactions, 0)}</td>
                  <td className="py-4 px-4 text-right font-bold text-winelio-orange tabular-nums">{fmtEur(totalEarned)}</td>
                  <td className="py-4 pl-4 text-right font-bold text-winelio-dark tabular-nums">{fmtEur(totalPending)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bar chart */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-winelio-dark mb-4 sm:mb-6">
            Commissions touchées par niveau
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {levelStats.map((stat) => {
              const pct = maxEarned > 0 ? Math.max((stat.earned / maxEarned) * 100, 0) : 0;
              return (
                <div key={stat.level} className="flex items-center gap-2 sm:gap-4">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground w-14 sm:w-24 shrink-0">
                    <span className="sm:hidden">N{stat.level}</span>
                    <span className="hidden sm:inline">Niveau {stat.level}</span>
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-7 sm:h-8 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${LEVEL_BAR_COLORS[stat.level]} transition-all duration-500`}
                      style={{ width: `${pct}%`, minWidth: stat.earned > 0 ? "2rem" : "0" }}
                    />
                    {stat.earned > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold text-winelio-dark tabular-nums">
                        {fmtEur(stat.earned)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {maxEarned <= 1 && (
            <p className="text-center text-muted-foreground text-sm mt-6">
              Aucune commission réseau touchée pour le moment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="!rounded-2xl">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-winelio-dark mb-4 sm:mb-6">
            Historique des commissions réseau
          </h3>
          {allCommissions.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">Aucune commission réseau enregistrée.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allCommissions.slice(0, 50).map((c) => {
                const isPending = c.status === "PENDING";
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 sm:p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                      <span className={`inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-full text-xs font-bold text-white ${LEVEL_BADGE_COLORS[c.level] ?? "bg-gray-400"}`}>
                        {c.level}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-winelio-dark text-sm truncate">
                          {c.description ?? `Commission niveau ${c.level}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {isPending && <span className="ml-2 text-winelio-amber font-medium">· En attente</span>}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${isPending ? "text-winelio-gray" : "text-winelio-orange"}`}>
                      +{fmtEur(c.amount)}
                    </span>
                  </div>
                );
              })}
              {allCommissions.length > 50 && (
                <p className="text-center text-xs text-muted-foreground pt-2">
                  50 plus récentes affichées sur {allCommissions.length}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
