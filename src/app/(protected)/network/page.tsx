import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NetworkTree } from "@/components/network-tree";
import { NetworkGraph } from "@/components/network-graph";
import { CopyButton, ShareButton } from "@/components/referral-buttons";

export default async function NetworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch current user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, sponsor_code")
    .eq("id", user.id)
    .single();

  // Fetch direct referrals (level 1)
  const { data: referrals, count: totalReferrals } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, created_at, avatar", { count: "exact" })
    .eq("sponsor_id", user.id);

  // For each referral, count their own referrals
  const referralsWithStats = await Promise.all(
    (referrals ?? []).map(async (ref) => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", ref.id);

      const { data: commData } = await supabase
        .from("commission_transactions")
        .select("amount")
        .eq("source_user_id", ref.id);

      const totalCommissions = (commData ?? []).reduce(
        (sum, c) => sum + (c.amount ?? 0),
        0
      );

      return { ...ref, sub_referrals: count ?? 0, total_commissions: totalCommissions };
    })
  );

  // Count total network members across ALL levels (up to 5) recursively
  let totalNetworkMembers = 0;
  let currentLevelIds = [user.id];
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (currentLevelIds.length === 0) break;
    const { data: lvlMembers } = await supabase
      .from("profiles")
      .select("id")
      .in("sponsor_id", currentLevelIds);
    if (!lvlMembers || lvlMembers.length === 0) break;
    totalNetworkMembers += lvlMembers.length;
    currentLevelIds = lvlMembers.map((m) => m.id);
  }

  // Network gains from commission_transactions
  const { data: networkCommissions } = await supabase
    .from("commission_transactions")
    .select("amount, level, created_at")
    .eq("user_id", user.id)
    .not("level", "is", null);

  const totalNetworkGains = (networkCommissions ?? []).reduce(
    (sum, c) => sum + (c.amount ?? 0),
    0
  );

  // Commissions this month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const commissionsThisMonth = (networkCommissions ?? [])
    .filter((c) => c.created_at >= firstOfMonth)
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);

  // Growth: compare referrals count to last month
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const referralsLastMonth = (referrals ?? []).filter(
    (r) => r.created_at < firstOfMonth && r.created_at >= firstOfLastMonth
  ).length;
  const referralsThisMonthCount = (referrals ?? []).filter(
    (r) => r.created_at >= firstOfMonth
  ).length;
  const growth =
    referralsLastMonth > 0
      ? Math.round(((referralsThisMonthCount - referralsLastMonth) / referralsLastMonth) * 100)
      : referralsThisMonthCount > 0
        ? 100
        : 0;

  const sponsorCode = profile?.sponsor_code ?? "";

  const stats = [
    {
      title: "Total membres",
      value: String(totalNetworkMembers),
      subtitle: `dont ${totalReferrals ?? 0} filleuls directs`,
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
      accent: false,
    },
    {
      title: "Gains réseau",
      value: `${totalNetworkGains.toFixed(2)} €`,
      subtitle: "Total cumulé",
      icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      accent: true,
    },
    {
      title: "Ce mois",
      value: `${commissionsThisMonth.toFixed(2)} €`,
      subtitle: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z",
      accent: false,
    },
    {
      title: "Croissance",
      value: `${growth >= 0 ? "+" : ""}${growth}%`,
      subtitle: "vs mois précédent",
      icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
      accent: growth > 0,
    },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-950 to-black pb-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Mon Réseau</h1>
          <p className="text-sm text-gray-500 mt-0.5">5 niveaux · MLM Kiparlo</p>
        </div>
        <Link
          href="/network/stats"
          className="flex items-center gap-1.5 text-xs font-semibold text-kiparlo-orange border border-kiparlo-orange/30 rounded-xl px-3 py-2 hover:bg-kiparlo-orange/10 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Stats
        </Link>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 px-4 mb-5">
        {stats.map((s) => (
          <div
            key={s.title}
            className="relative overflow-hidden rounded-2xl bg-white/[0.05] border border-white/[0.08] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{s.title}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accent ? "bg-kiparlo-orange/20" : "bg-white/5"}`}>
                <svg className={`w-4 h-4 ${s.accent ? "text-kiparlo-orange" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
              </div>
            </div>
            <p className={`text-xl font-extrabold tabular-nums tracking-tight ${s.accent ? "text-kiparlo-orange" : "text-white"}`}>
              {s.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{s.subtitle}</p>
          </div>
        ))}
      </div>

      {/* Sponsor code */}
      <div className="mx-4 mb-5 rounded-2xl bg-white/[0.05] border border-kiparlo-orange/20 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Mon code parrain</p>
        <div className="flex flex-col gap-3">
          <div className="bg-black/40 rounded-xl px-5 py-3 border border-kiparlo-orange/30 text-center">
            <span className="text-3xl font-extrabold tracking-[0.25em] bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent select-all">
              {sponsorCode}
            </span>
          </div>
          <div className="flex gap-2">
            <CopyButton code={sponsorCode} />
            <ShareButton code={sponsorCode} />
          </div>
        </div>
      </div>

      {/* Direct referrals */}
      <div className="mx-4 mb-5 rounded-2xl bg-white/[0.05] border border-white/[0.08] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">
            Filleuls directs
            <span className="ml-2 text-xs font-normal text-gray-500">({totalReferrals ?? 0})</span>
          </h2>
          <Link
            href="/network/stats"
            className="text-xs text-kiparlo-orange hover:text-kiparlo-amber transition-colors font-medium"
          >
            Voir tout
          </Link>
        </div>

        {referralsWithStats.length === 0 ? (
          <div className="flex flex-col items-center py-10 px-4">
            <div className="w-14 h-14 rounded-full bg-kiparlo-orange/10 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 text-center">Aucun filleul pour le moment.</p>
            <p className="text-xs text-gray-600 text-center mt-1">Partagez votre code parrain !</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {referralsWithStats.map((ref) => {
              const initials = [ref.first_name, ref.last_name]
                .filter(Boolean)
                .map((n: string) => n[0])
                .join("")
                .toUpperCase() || "?";
              const fullName = ((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom";
              return (
                <div key={ref.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-kiparlo-orange to-kiparlo-amber flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{fullName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(ref.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-3">
                    <div className="text-center">
                      <p className="text-sm font-bold text-white tabular-nums">{ref.sub_referrals}</p>
                      <p className="text-[10px] text-gray-600">filleuls</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-kiparlo-orange tabular-nums">{ref.total_commissions.toFixed(2)} €</p>
                      <p className="text-[10px] text-gray-600">commissions</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Network graph */}
      <div className="mx-4 mb-5 rounded-2xl bg-white/[0.05] border border-white/[0.08] overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">Vue graphique</h2>
          <p className="text-xs text-gray-500 mt-0.5">Pincez pour zoomer · Glissez pour naviguer</p>
        </div>
        <div className="p-3">
          <NetworkGraph
            userId={user.id}
            userName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
          />
        </div>
      </div>

      {/* Network tree */}
      <div className="mx-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white">Liste détaillée</h2>
          <p className="text-xs text-gray-500 mt-0.5">Réseau complet sur 5 niveaux</p>
        </div>
        <div className="p-4">
          <NetworkTree userId={user.id} />
        </div>
      </div>
    </div>
  );
}
