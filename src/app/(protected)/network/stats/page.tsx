import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface LevelStat {
  level: number;
  members: number;
  total: number;
}

interface CommissionRecord {
  id: string;
  amount: number;
  level: number;
  created_at: string;
  description: string | null;
}

export default async function NetworkStatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch all network commissions (where level IS NOT NULL)
  const { data: commissions } = await supabase
    .from("commission_transactions")
    .select("id, amount, level, created_at, description")
    .eq("user_id", user.id)
    .not("level", "is", null)
    .order("created_at", { ascending: false });

  const allCommissions: CommissionRecord[] = (commissions ?? []).map((c) => ({
    id: c.id,
    amount: c.amount ?? 0,
    level: c.level ?? 0,
    created_at: c.created_at,
    description: c.description ?? null,
  }));

  // Aggregate by level (1-5)
  const levelStats: LevelStat[] = [];
  for (let lvl = 1; lvl <= 5; lvl++) {
    const levelCommissions = allCommissions.filter((c) => c.level === lvl);
    const uniqueMembers = new Set<string>();
    // We don't have source_user_id in our select, so count transactions as proxy
    // For member count, we re-query
    const { count } = await supabase
      .from("commission_transactions")
      .select("source_user_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("level", lvl);

    levelStats.push({
      level: lvl,
      members: count ?? 0,
      total: levelCommissions.reduce((sum, c) => sum + c.amount, 0),
    });
  }

  const maxCommission = Math.max(...levelStats.map((s) => s.total), 1);
  const totalAllLevels = levelStats.reduce((sum, s) => sum + s.total, 0);

  const levelLabels: Record<number, string> = {
    1: "Filleuls directs",
    2: "Niveau 2",
    3: "Niveau 3",
    4: "Niveau 4",
    5: "Niveau 5",
  };

  const levelBarColors: Record<number, string> = {
    1: "from-winelio-orange to-winelio-amber",
    2: "from-winelio-amber to-yellow-400",
    3: "from-yellow-400 to-yellow-300",
    4: "from-emerald-500 to-emerald-400",
    5: "from-blue-500 to-blue-400",
  };

  return (
    <div className="min-h-screen bg-winelio-light">
      {/* Header */}
      <header className="bg-winelio-dark text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard">
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="text-white">BUZ</span>
              <span className="bg-gradient-to-r from-winelio-orange to-winelio-amber bg-clip-text text-transparent">
                RE
              </span>
              <span className="text-white">CO</span>
            </h1>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/network"
              className="text-sm text-winelio-orange hover:text-winelio-amber transition-colors font-medium"
            >
              Retour au reseau
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-winelio-dark mb-2">
          Statistiques reseau detaillees
        </h2>
        <p className="text-winelio-gray mb-8">
          Vue complete de vos commissions par niveau de parrainage.
        </p>

        {/* Summary card */}
        <Card className="!rounded-2xl mb-8"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-winelio-gray font-medium">
                Total commissions reseau
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-winelio-orange to-winelio-amber bg-clip-text text-transparent">
                {totalAllLevels.toFixed(2)} EUR
              </p>
            </div>
            <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-winelio-orange"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </CardContent></Card>

        {/* Table by level */}
        <Card className="!rounded-2xl mb-8"><CardContent className="p-6">
          <h3 className="text-lg font-semibold text-winelio-dark mb-6">
            Commissions par niveau
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-sm font-medium text-winelio-gray py-3 pr-4">
                    Niveau
                  </th>
                  <th className="text-center text-sm font-medium text-winelio-gray py-3 px-4">
                    Transactions
                  </th>
                  <th className="text-right text-sm font-medium text-winelio-gray py-3 px-4">
                    Total commissions
                  </th>
                  <th className="text-right text-sm font-medium text-winelio-gray py-3 pl-4">
                    Part
                  </th>
                </tr>
              </thead>
              <tbody>
                {levelStats.map((stat) => (
                  <tr
                    key={stat.level}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white bg-gradient-to-r ${levelBarColors[stat.level]}`}
                        >
                          {stat.level}
                        </span>
                        <span className="font-medium text-winelio-dark text-sm">
                          {levelLabels[stat.level]}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="font-semibold text-winelio-dark">
                        {stat.members}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-bold text-winelio-orange">
                        {stat.total.toFixed(2)} EUR
                      </span>
                    </td>
                    <td className="py-4 pl-4 text-right">
                      <span className="text-sm text-winelio-gray">
                        {totalAllLevels > 0
                          ? ((stat.total / totalAllLevels) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-4 pr-4 font-bold text-winelio-dark">Total</td>
                  <td className="py-4 px-4 text-center font-bold text-winelio-dark">
                    {levelStats.reduce((sum, s) => sum + s.members, 0)}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-winelio-orange">
                    {totalAllLevels.toFixed(2)} EUR
                  </td>
                  <td className="py-4 pl-4 text-right font-bold text-winelio-dark">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent></Card>

        {/* CSS Bar chart */}
        <Card className="!rounded-2xl mb-8"><CardContent className="p-6">
          <h3 className="text-lg font-semibold text-winelio-dark mb-6">
            Graphique des commissions par niveau
          </h3>
          <div className="space-y-4">
            {levelStats.map((stat) => {
              const pct =
                maxCommission > 0
                  ? Math.max((stat.total / maxCommission) * 100, 0)
                  : 0;
              return (
                <div key={stat.level} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-muted-foreground w-24 shrink-0">
                    Niveau {stat.level}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-8 overflow-hidden relative">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${levelBarColors[stat.level]} transition-all duration-500`}
                      style={{ width: `${pct}%`, minWidth: stat.total > 0 ? "2rem" : "0" }}
                    />
                    {stat.total > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-winelio-dark">
                        {stat.total.toFixed(2)} EUR
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {maxCommission <= 1 && (
            <p className="text-center text-muted-foreground text-sm mt-6">
              Aucune commission reseau pour le moment.
            </p>
          )}
        </CardContent></Card>

        {/* Commission history */}
        <Card className="!rounded-2xl"><CardContent className="p-6">
          <h3 className="text-lg font-semibold text-winelio-dark mb-6">
            Historique des commissions reseau
          </h3>

          {allCommissions.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-winelio-orange"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground">
                Aucune commission reseau enregistree.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {allCommissions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white bg-gradient-to-r ${levelBarColors[c.level] ?? "from-gray-400 to-gray-300"}`}
                    >
                      {c.level}
                    </span>
                    <div>
                      <p className="font-medium text-winelio-dark text-sm">
                        {c.description ?? `Commission niveau ${c.level}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-winelio-orange text-sm">
                    +{c.amount.toFixed(2)} EUR
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </main>
    </div>
  );
}
