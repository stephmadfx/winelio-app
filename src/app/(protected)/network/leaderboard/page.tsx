import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/profile-avatar";
import {
  fetchTopSponsors,
  fetchTopRevenue,
  fetchTopRecos,
  fetchMyPosition,
  formatPodiumName,
  fmtEur,
  startOfCurrentMonthUTC,
  startOfAllTime,
  type LeaderboardCategory,
  type PodiumEntry,
} from "@/lib/leaderboard";

export const revalidate = 300; // 5 min

const TABS: { key: LeaderboardCategory; label: string; emoji: string; suffix: string }[] = [
  { key: "sponsors", label: "Parrains", emoji: "🏆", suffix: " pts" },
  { key: "revenue",  label: "Revenus",  emoji: "💰", suffix: "" },
  { key: "recos",    label: "Recos",    emoji: "📋", suffix: "" },
];

const PERIODS: { key: string; label: string; startFn: () => Date }[] = [
  { key: "month", label: "Ce mois", startFn: startOfCurrentMonthUTC },
  { key: "30d", label: "30j",
    startFn: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  { key: "90d", label: "90j",
    startFn: () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  { key: "all", label: "All-time", startFn: startOfAllTime },
];

function formatValue(value: number, category: LeaderboardCategory, suffix: string): string {
  if (category === "revenue") return fmtEur(value);
  return `${value}${suffix}`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; p?: string }>;
}) {
  const params = await searchParams;
  const tabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "sponsors") as LeaderboardCategory;
  const periodKey = PERIODS.find((p) => p.key === params.p)?.key ?? "month";
  const period = PERIODS.find((p) => p.key === periodKey)!;
  const tab = TABS.find((t) => t.key === tabKey)!;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const periodStart = period.startFn();

  let entries: PodiumEntry[] = [];
  if (tabKey === "sponsors") entries = await fetchTopSponsors(supabase, periodStart, 10);
  else if (tabKey === "revenue") entries = await fetchTopRevenue(supabase, periodStart, 10);
  else entries = await fetchTopRecos(supabase, periodStart, 10);

  const myPos = await fetchMyPosition(supabase, user.id, tabKey, periodStart);

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">Hall of Fame Winelio</h2>
          <p className="text-sm text-winelio-gray mt-1">
            Les meilleurs bâtisseurs de réseau, classement mis à jour toutes les 5 minutes.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-winelio-orange font-medium">
          ← Dashboard
        </Link>
      </div>

      {/* Tabs catégorie */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/network/leaderboard?tab=${t.key}&p=${periodKey}`}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              t.key === tabKey
                ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
                : "bg-white text-winelio-dark border border-gray-200 hover:border-winelio-orange/40"
            }`}
          >
            {t.emoji} {t.label}
          </Link>
        ))}
      </div>

      {/* Filtres période */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/network/leaderboard?tab=${tabKey}&p=${p.key}`}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              p.key === periodKey
                ? "bg-winelio-dark text-white"
                : "bg-white text-winelio-gray border border-gray-200 hover:border-winelio-dark/40"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Top 10 */}
      <Card className="!rounded-2xl mb-4">
        <CardContent className="p-4 sm:p-6">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-winelio-gray text-sm">Aucun classement pour cette période.</p>
              <p className="text-winelio-orange font-semibold mt-2">Sois le premier à inscrire ton nom !</p>
            </div>
          ) : (
            <ol className="space-y-2">
              {entries.map((e, idx) => {
                const rank = idx + 1;
                const isMe = e.user_id === user.id;
                return (
                  <li
                    key={e.user_id}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      isMe ? "bg-winelio-orange/10 ring-1 ring-winelio-orange/30" : "bg-muted/50"
                    }`}
                  >
                    <span className={`shrink-0 w-8 text-center font-bold ${
                      rank <= 3 ? "text-winelio-orange text-lg" : "text-winelio-gray text-sm"
                    }`}>
                      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
                    </span>
                    <ProfileAvatar
                      name={`${e.first_name ?? ""} ${e.last_name ?? ""}`}
                      avatar={e.avatar}
                      size={36}
                    />
                    <span className="flex-1 min-w-0 text-sm font-medium text-winelio-dark truncate">
                      {formatPodiumName(e.first_name, e.last_name)}
                      {isMe && <span className="ml-2 text-xs text-winelio-orange font-semibold">(toi)</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-winelio-orange tabular-nums">
                      {formatValue(e.value, tabKey, tab.suffix)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Ma position si hors top 10 */}
      {myPos.rank > 10 && (
        <Card className="!rounded-2xl">
          <CardContent className="p-4 sm:p-5 text-center">
            <p className="text-sm text-winelio-gray">Ton classement</p>
            <p className="text-2xl font-bold text-winelio-orange mt-1">
              #{myPos.rank} <span className="text-sm font-normal text-winelio-gray">sur {myPos.totalUsers}</span>
            </p>
            <p className="text-sm text-winelio-dark mt-1">
              {formatValue(myPos.value, tabKey, tab.suffix)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
