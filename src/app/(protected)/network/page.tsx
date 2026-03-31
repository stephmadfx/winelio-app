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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, sponsor_code")
    .eq("id", user.id)
    .single();

  const { data: referrals, count: totalReferrals } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, created_at, avatar", { count: "exact" })
    .eq("sponsor_id", user.id);

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
      const totalCommissions = (commData ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0);
      return { ...ref, sub_referrals: count ?? 0, total_commissions: totalCommissions };
    })
  );

  let totalNetworkMembers = 0;
  let currentLevelIds = [user.id];
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (currentLevelIds.length === 0) break;
    const { data: lvlMembers } = await supabase
      .from("profiles").select("id").in("sponsor_id", currentLevelIds);
    if (!lvlMembers || lvlMembers.length === 0) break;
    totalNetworkMembers += lvlMembers.length;
    currentLevelIds = lvlMembers.map((m) => m.id);
  }

  const { data: networkCommissions } = await supabase
    .from("commission_transactions")
    .select("amount, level, created_at")
    .eq("user_id", user.id)
    .not("level", "is", null);

  const totalNetworkGains = (networkCommissions ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const commissionsThisMonth = (networkCommissions ?? [])
    .filter((c) => c.created_at >= firstOfMonth)
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);

  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const referralsLastMonth = (referrals ?? []).filter(
    (r) => r.created_at < firstOfMonth && r.created_at >= firstOfLastMonth
  ).length;
  const referralsThisMonthCount = (referrals ?? []).filter((r) => r.created_at >= firstOfMonth).length;
  const growth =
    referralsLastMonth > 0
      ? Math.round(((referralsThisMonthCount - referralsLastMonth) / referralsLastMonth) * 100)
      : referralsThisMonthCount > 0 ? 100 : 0;

  const sponsorCode = profile?.sponsor_code ?? "";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-kiparlo-dark">Mon Réseau</h2>
        <Link href="/network/stats" className="text-sm text-kiparlo-orange hover:text-kiparlo-amber transition-colors font-medium">
          Stats détaillées
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            title: "Total membres", value: String(totalNetworkMembers),
            sub: `dont ${totalReferrals ?? 0} directs`,
            icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
            accent: false,
          },
          {
            title: "Gains réseau", value: `${totalNetworkGains.toFixed(2)} €`,
            sub: "Total cumulé",
            icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            accent: true,
          },
          {
            title: "Ce mois", value: `${commissionsThisMonth.toFixed(2)} €`,
            sub: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
            icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z",
            accent: false,
          },
          {
            title: "Croissance", value: `${growth >= 0 ? "+" : ""}${growth}%`,
            sub: "vs mois précédent",
            icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
            accent: growth > 0,
          },
        ].map((s) => (
          <div key={s.title} className="bg-white dark:bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-kiparlo-gray uppercase tracking-wider">{s.title}</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accent ? "bg-kiparlo-orange/10" : "bg-gray-50"}`}>
                <svg className={`w-4 h-4 ${s.accent ? "text-kiparlo-orange" : "text-kiparlo-gray"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                </svg>
              </div>
            </div>
            <p className={`text-xl font-extrabold tabular-nums ${s.accent ? "text-kiparlo-orange" : "text-kiparlo-dark"}`}>{s.value}</p>
            <p className="text-xs text-kiparlo-gray mt-0.5 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sponsor code */}
      <div className="bg-white dark:bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <h3 className="text-sm font-semibold text-kiparlo-gray uppercase tracking-wider mb-4">Mon code parrain</h3>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-kiparlo-light rounded-xl border-2 border-dashed border-kiparlo-orange px-8 py-3 text-center w-full sm:w-auto">
            <span className="text-3xl font-extrabold tracking-[0.2em] bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent select-all">
              {sponsorCode}
            </span>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <CopyButton code={sponsorCode} />
            <ShareButton code={sponsorCode} />
          </div>
        </div>
      </div>

      {/* Filleuls directs */}
      <div className="bg-white dark:bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-kiparlo-dark">
            Filleuls directs
            <span className="ml-2 text-sm font-normal text-kiparlo-gray">({totalReferrals ?? 0})</span>
          </h3>
          <Link href="/network/stats" className="text-sm text-kiparlo-orange hover:text-kiparlo-amber transition-colors font-medium">
            Voir tout
          </Link>
        </div>

        {referralsWithStats.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-r from-kiparlo-orange/10 to-kiparlo-amber/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <p className="text-kiparlo-gray text-sm">Aucun filleul pour le moment.</p>
            <p className="text-xs text-gray-400 mt-1">Partagez votre code parrain !</p>
          </div>
        ) : (
          <div className="space-y-2">
            {referralsWithStats.map((ref) => {
              const initials = [ref.first_name, ref.last_name].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?";
              const fullName = ((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom";
              return (
                <div key={ref.id} className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-kiparlo-light hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-kiparlo-dark text-sm truncate">{fullName}</p>
                      <p className="text-xs text-kiparlo-gray">
                        {new Date(ref.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 ml-2">
                    <div className="text-center">
                      <p className="font-bold text-kiparlo-dark text-sm tabular-nums">{ref.sub_referrals}</p>
                      <p className="text-[10px] text-kiparlo-gray">filleuls</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-kiparlo-orange text-sm tabular-nums">{ref.total_commissions.toFixed(2)} €</p>
                      <p className="text-[10px] text-kiparlo-gray">commissions</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Graphe */}
      <div className="bg-white dark:bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mb-6">
        <h3 className="text-base font-semibold text-kiparlo-dark mb-1">Vue graphique</h3>
        <p className="text-xs text-kiparlo-gray mb-4">Pincez pour zoomer · Glissez pour naviguer</p>
        <NetworkGraph
          userId={user.id}
          userName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
        />
      </div>

      {/* Arbre */}
      <div className="bg-white dark:bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
        <h3 className="text-base font-semibold text-kiparlo-dark mb-1">Liste détaillée</h3>
        <p className="text-xs text-kiparlo-gray mb-4">Réseau complet sur 5 niveaux</p>
        <NetworkTree userId={user.id} />
      </div>
    </div>
  );
}
