import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NetworkTree } from "@/components/network-tree";
import { NetworkGraph } from "@/components/network-graph";
import { CopyButton, ShareButton, EmailInviteButton } from "@/components/referral-buttons";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileAvatar } from "@/components/profile-avatar";

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
    .select("id, first_name, last_name, avatar, sponsor_code")
    .eq("id", user.id)
    .single();

  const { data: referrals, count: totalReferrals } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, city, created_at, avatar, is_professional, is_demo, companies!owner_id(alias, city, category:categories(name))", { count: "exact" })
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
      return {
        ...ref,
        sub_referrals: count ?? 0,
        total_commissions: totalCommissions,
        company: (() => {
          const rawCompany = Array.isArray(ref.companies) ? ref.companies[0] ?? null : (ref.companies ?? null);
          if (!rawCompany) return null;
          const rawCat = (rawCompany as Record<string, unknown>).category;
          const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;
          return {
            alias: (rawCompany as { alias?: string | null }).alias ?? null,
            city: (rawCompany as { city?: string | null }).city ?? null,
            category: catName,
          };
        })(),
      };
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
        <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">Mon Réseau</h2>
        <Link href="/network/stats" className="text-sm text-winelio-orange hover:text-winelio-amber transition-colors font-medium">
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
          <Card key={s.title} className="!rounded-2xl">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-winelio-gray uppercase tracking-wider">{s.title}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.accent ? "bg-winelio-orange/10" : "bg-muted"}`}>
                  <svg className={`w-4 h-4 ${s.accent ? "text-winelio-orange" : "text-muted-foreground"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                  </svg>
                </div>
              </div>
              <p className={`text-xl font-extrabold tabular-nums ${s.accent ? "text-winelio-orange" : "text-winelio-dark"}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sponsor code */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-winelio-gray uppercase tracking-wider mb-4">Mon code parrain</h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-winelio-light dark:bg-muted rounded-xl border-2 border-dashed border-winelio-orange px-8 py-3 text-center w-full sm:w-auto">
              <span className="text-3xl font-extrabold tracking-[0.2em] bg-gradient-to-r from-winelio-orange to-winelio-amber bg-clip-text text-transparent select-all">
                {sponsorCode}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              <CopyButton code={sponsorCode} />
              <EmailInviteButton code={sponsorCode} />
              <ShareButton code={sponsorCode} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filleuls directs */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-winelio-dark">
              Filleuls directs
              <span className="ml-2 text-sm font-normal text-muted-foreground">({totalReferrals ?? 0})</span>
            </h3>
            <Link href="/network/stats" className="text-sm text-winelio-orange hover:text-winelio-amber transition-colors font-medium">
              Voir tout
            </Link>
          </div>

          {referralsWithStats.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">Aucun filleul pour le moment.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Partagez votre code parrain !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referralsWithStats.map((ref) => {
                const isPro = ref.is_professional && ref.company?.alias;
                const displayName = isPro
                  ? ref.company!.alias!
                  : (((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom");
                const displaySub = isPro
                  ? [ref.company!.category, ref.company!.city ?? ref.city].filter(Boolean).join(" · ")
                  : null;
                return (
                  <div key={ref.id} className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        name={displayName}
                        avatar={ref.avatar}
                        className="h-9 w-9"
                        initialsClassName="text-[11px]"
                      />
                      <div className="min-w-0">
                        <p className={`font-semibold text-sm truncate ${isPro ? "font-mono text-winelio-orange" : "text-winelio-dark"}`}>
                          {displayName}
                          {ref.is_demo && (
                            <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold text-orange-400 bg-orange-50 border border-orange-100">
                              demo
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {displaySub
                            ? <span className="mr-1">{displaySub} ·</span>
                            : ref.city && <span className="mr-1">{ref.city} ·</span>}
                          {new Date(ref.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0 ml-2">
                      <div className="text-center">
                        <p className="font-bold text-winelio-dark text-sm tabular-nums">{ref.sub_referrals}</p>
                        <p className="text-[10px] text-muted-foreground">filleuls</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-winelio-orange text-sm tabular-nums">{ref.total_commissions.toFixed(2)} €</p>
                        <p className="text-[10px] text-muted-foreground">commissions</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graphe */}
      <Card className="!rounded-2xl mb-6">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1">Vue graphique</h3>
          <p className="text-xs text-muted-foreground mb-4">Pincez pour zoomer · Glissez pour naviguer</p>
          <NetworkGraph
            userId={user.id}
            userName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
            userAvatar={profile?.avatar ?? null}
          />
        </CardContent>
      </Card>

      {/* Arbre */}
      <Card className="!rounded-2xl">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1">Liste détaillée</h3>
          <p className="text-xs text-muted-foreground mb-4">Réseau complet sur 5 niveaux</p>
          <NetworkTree userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
