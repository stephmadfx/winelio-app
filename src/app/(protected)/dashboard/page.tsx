import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import { OnboardingModal } from "@/components/onboarding-modal";
import { Card, CardContent } from "@/components/ui/card";
import { MonthlyBarChart } from "@/components/monthly-bar-chart";
import { AnimatedCounter } from "@/components/animated-counter";
import { FeedEvent, formatUserName, formatRelativeTime } from "@/lib/feed-utils";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");

  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

  const [
    { count: recoThisMonth },
    { data: wallet },
    { count: totalRecos },
    { count: completedRecos },
    { data: recentRecos },
    { data: recosDates },
  ] = await Promise.all([
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", startOfMonth),
    supabase
      .from("user_wallet_summaries")
      .select("total_earned, available, total_wins, available_wins")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id),
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .eq("status", "COMPLETED"),
    supabase
      .from("recommendations")
      .select("id, created_at, amount, status")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("recommendations")
      .select("created_at")
      .eq("referrer_id", user.id)
      .gte("created_at", sixMonthsAgo),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const isSuperAdmin = user.app_metadata?.role === "super_admin";
  const needsOnboarding = !isSuperAdmin && (!profile?.first_name || !profile?.last_name);

  // Réseau MLM (5 niveaux) — une seule requête récursive via RPC
  const { data: networkRows } = await supabase.rpc("get_network_ids", {
    p_user_id: user.id,
    p_max_depth: 5,
  });
  const allNetworkIds: string[] = (networkRows ?? []).map((r: { member_id: string }) => r.member_id);
  const networkCount = allNetworkIds.length;

  // Filleuls directs pour l'arbre réseau desktop
  const { data: directReferrals } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("sponsor_id", user.id)
    .limit(3);

  // Événements d'activité personnelle
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activityEvents: FeedEvent[] = [];

  if (allNetworkIds.length > 0) {
    const [
      { data: newReferrals },
      { data: validatedRecos },
      { data: bigCommissions },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, city, created_at")
        .eq("sponsor_id", user.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("recommendations")
        .select("id, referrer_id, amount, created_at")
        .in("referrer_id", allNetworkIds)
        .eq("status", "COMPLETED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("commission_transactions")
        .select("id, user_id, amount, created_at")
        .in("user_id", allNetworkIds)
        .gt("amount", 50)
        .eq("status", "EARNED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const referrerIds = [
      ...(validatedRecos?.map((r) => r.referrer_id) ?? []),
      ...(bigCommissions?.map((c) => c.user_id) ?? []),
    ];
    const profilesMap: Record<string, { first_name: string | null; last_name: string | null; city: string | null }> = {};
    if (referrerIds.length > 0) {
      const { data: refProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, city")
        .in("id", [...new Set(referrerIds)]);
      refProfiles?.forEach((p) => { profilesMap[p.id] = p; });
    }

    newReferrals?.forEach((p) => {
      activityEvents.push({
        id: `nr-${p.id}`,
        kind: "new_referral",
        user: formatUserName(p.first_name, p.last_name),
        city: p.city,
        level: 1,
        timestamp: p.created_at,
      });
    });
    validatedRecos?.forEach((r) => {
      const prof = profilesMap[r.referrer_id];
      activityEvents.push({
        id: `rv-${r.id}`,
        kind: "reco_validated",
        user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
        city: prof?.city ?? null,
        amount: r.amount ?? undefined,
        timestamp: r.created_at,
      });
    });
    bigCommissions?.forEach((c) => {
      const prof = profilesMap[c.user_id];
      activityEvents.push({
        id: `cr-${c.id}`,
        kind: "commission_received",
        user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
        city: prof?.city ?? null,
        amount: c.amount,
        timestamp: c.created_at,
      });
    });
    activityEvents.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  const topEvents = activityEvents.slice(0, 4);
  const totalEarned = wallet?.total_earned ?? 0;
  const availableBalance = wallet?.available ?? 0;
  const totalWins = wallet?.total_wins ?? 0;
  const successRate =
    totalRecos && totalRecos > 0
      ? Math.round(((completedRecos ?? 0) / totalRecos) * 100)
      : 0;

  // Données du graphe mensuel (5 derniers mois)
  const monthlyData = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const count = (recosDates ?? []).filter((r) => {
      const rd = new Date(r.created_at);
      return rd.getFullYear() === year && rd.getMonth() === month;
    }).length;
    return {
      label: d.toLocaleDateString("fr-FR", { month: "short" }),
      count,
      isCurrent: i === 4,
    };
  });
  const maxMonthCount = Math.max(...monthlyData.map((m) => m.count), 1);

  return (
    <>
      {needsOnboarding && <OnboardingModal userId={user.id} />}

      {/* ═══ MOBILE (< lg) ═══ */}
      <div className="lg:hidden space-y-5">

        {/* Hero card gradient */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber p-6 text-white shadow-xl">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="relative z-10 space-y-4">
            <div>
              <h2 className="text-xl font-extrabold leading-tight">
                Recommandez. Gagnez. Grandissez.
              </h2>
              <p className="text-white/80 mt-1 text-sm">
                {recoThisMonth ?? 0} recommandation{(recoThisMonth ?? 0) > 1 ? "s" : ""} ce mois
                {networkCount > 0 ? ` · ${networkCount} membre${networkCount > 1 ? "s" : ""} actif${networkCount > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <Link
              href="/recommendations/new"
              className="inline-flex items-center gap-2 bg-white text-winelio-orange px-5 py-2.5 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-all"
            >
              Faire une recommandation
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </section>

        {/* Feed d'activité */}
        <section className="space-y-3">
          <h3 className="font-bold text-winelio-dark text-base">Activité</h3>
          {topEvents.length > 0 ? (
            <div className="space-y-2">
              {topEvents.map((event, i) => (
                <ActivityItem key={event.id} event={event} alternate={i % 2 === 1} />
              ))}
            </div>
          ) : (
            <Card className="!rounded-2xl">
              <CardContent className="p-6 text-center">
                <p className="text-winelio-gray text-sm">Aucune activité récente dans votre réseau.</p>
                <Link href="/network" className="inline-block mt-3 text-winelio-orange font-semibold text-sm">
                  Inviter des membres →
                </Link>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Grille KPIs 2×2 */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard numValue={recoThisMonth ?? 0} label="Recos ce mois" variant="orange" delay={0}
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          <KpiCard numValue={Number(totalEarned)} suffix=" €" label="Gains totaux" variant="amber" delay={80}
            icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <KpiCard numValue={networkCount} label="Membres réseau" variant="orange" delay={160}
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          <KpiCard numValue={successRate} suffix=" %" label="Taux de succès" variant="amber" delay={240}
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </div>

        {/* Actions rapides */}
        <section className="space-y-3">
          <h3 className="font-bold text-winelio-dark text-base">Actions rapides</h3>
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            <ActionChip href="/recommendations/new" label="Reco" icon="M12 4v16m8-8H4" />
            <ActionChip href="/network" label="Inviter"
              icon="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            <ActionChip href="/wallet" label="Gains"
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <ActionChip href="/network" label="Réseau"
              icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </div>
        </section>
      </div>

      {/* ═══ DESKTOP (≥ lg) ═══ */}
      <div className="hidden lg:flex lg:flex-col lg:gap-8">

        {/* Header desktop */}
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-winelio-dark tracking-tight">Tableau de bord</h2>
            <p className="text-winelio-gray text-sm mt-1">
              {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <Link
            href="/recommendations/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white font-bold text-sm shadow-md hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle recommandation
          </Link>
        </header>

        {/* KPIs desktop – 4 colonnes */}
        <section className="grid grid-cols-4 gap-5">
          <DesktopKpiCard
            numValue={recoThisMonth ?? 0}
            label="Recommandations"
            sub="ce mois"
            trend={`+${recoThisMonth ?? 0}`}
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            accentColor="orange"
            delay={0}
          />
          <DesktopKpiCard
            numValue={Number(totalEarned)}
            suffix=" €"
            decimals={2}
            label="Gains totaux"
            sub={`dont ${Number(wallet?.total_earned ?? 0 - Number(availableBalance)).toFixed(0)} € retirés`}
            icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            accentColor="amber"
            delay={80}
          />
          <DesktopKpiCard
            numValue={networkCount}
            label="Membres réseau"
            sub={`${directReferrals?.length ?? 0} filleuls directs`}
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            accentColor="orange"
            delay={160}
          />
          <DesktopKpiCard
            numValue={successRate}
            suffix=" %"
            label="Taux de succès"
            sub={`${completedRecos ?? 0} / ${totalRecos ?? 0} recos`}
            sparkline={monthlyData.map((m) => m.count)}
            icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            accentColor="amber"
            delay={240}
          />
        </section>

        {/* Activité récente — pleine largeur */}
        <section>
          <Card className="!rounded-2xl shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-winelio-dark">Activité</h3>
                <Link href="/recommendations" className="text-winelio-orange font-bold text-sm hover:underline">
                  Voir tout
                </Link>
              </div>
              {topEvents.length > 0 ? (
                <div className="relative space-y-4">
                  <div className="absolute left-[19px] top-2 bottom-2 w-[2px] bg-gray-100" />
                  {topEvents.slice(0, 3).map((event) => (
                    <DesktopActivityItem key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <p className="text-winelio-gray text-sm text-center py-4">
                  Aucune activité récente.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Grille 7/5 */}
        <section className="grid grid-cols-12 gap-6">

          {/* Colonne gauche — 7/12 */}
          <div className="col-span-7 flex flex-col gap-6">

            {/* Tableau recommandations récentes */}
            <Card className="!rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-lg text-winelio-dark">Recommandations récentes</h3>
                  <Link href="/recommendations" className="text-winelio-orange font-bold text-sm hover:underline">
                    Voir tout
                  </Link>
                </div>
                {(recentRecos ?? []).length > 0 ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-winelio-gray text-xs font-semibold uppercase tracking-wide">
                        <th className="pb-3">Référence</th>
                        <th className="pb-3">Date</th>
                        <th className="pb-3 text-right">Montant</th>
                        <th className="pb-3 text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recentRecos ?? []).map((reco, i) => (
                        <tr key={reco.id} className="border-b border-gray-50 hover:bg-winelio-light/50 transition-colors">
                          <td className="py-3.5">
                            <p className="font-semibold text-sm text-winelio-dark">Reco #{i + 1}</p>
                            <p className="text-xs text-winelio-gray">{reco.id.slice(0, 8)}…</p>
                          </td>
                          <td className="py-3.5 text-sm text-winelio-gray">
                            {new Date(reco.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3.5 text-sm font-bold text-winelio-dark text-right">
                            {reco.amount ? `${Number(reco.amount).toFixed(0)} €` : "—"}
                          </td>
                          <td className="py-3.5 text-center">
                            <RecoStatusBadge status={reco.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-winelio-gray text-sm text-center py-8">Aucune recommandation pour l&apos;instant.</p>
                )}
              </CardContent>
            </Card>

            {/* Performance mensuelle */}
            <Card className="!rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg text-winelio-dark mb-5">Performance mensuelle</h3>
                <MonthlyBarChart data={monthlyData} maxCount={maxMonthCount} />
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite — 5/12 */}
          <div className="col-span-5 flex flex-col gap-6">

            {/* Wallet card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-winelio-orange via-[#e55728] to-[#b83d00] p-6 text-white shadow-lg">
              {/* Shimmer sweep */}
              <div className="animate-shimmer absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
              <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-8 w-28 h-28 bg-black/10 rounded-full blur-xl pointer-events-none" />
              <div className="relative z-10 space-y-5">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="font-bold text-base">Mon Portefeuille</h3>
                </div>
                <div>
                  <p className="text-white/70 text-sm">Solde disponible</p>
                  <p className="text-4xl font-extrabold mt-1">
                    {Number(availableBalance).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </p>
                  <div className="inline-flex items-center gap-1.5 mt-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-sm font-semibold">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {Number(totalWins).toLocaleString("fr-FR")} Wins
                  </div>
                </div>
                <Link
                  href="/wallet/withdraw"
                  className="block w-full py-2.5 bg-white text-winelio-orange font-bold text-sm text-center rounded-xl hover:bg-winelio-light transition-colors shadow-sm"
                >
                  Retirer mes gains
                </Link>
              </div>
            </div>

            {/* Votre réseau */}
            <Card className="!rounded-2xl shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-winelio-dark">Votre réseau</h3>
                  <Link href="/network" className="text-winelio-gray hover:text-winelio-orange transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
                <div className="flex flex-col items-center gap-3">
                  {/* Vous */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full border-2 border-winelio-orange bg-gradient-to-br from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-winelio-orange">
                        {(profile?.first_name?.[0] ?? "?").toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-winelio-dark">Vous</span>
                  </div>
                  {/* Séparateur */}
                  {(directReferrals ?? []).length > 0 && (
                    <div className="w-px h-4 bg-gray-200" />
                  )}
                  {/* Filleuls directs */}
                  <div className="flex gap-6">
                    {(directReferrals ?? []).map((ref) => (
                      <div key={ref.id} className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-full border-2 border-winelio-amber/60 bg-winelio-amber/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-winelio-amber">
                            {(ref.first_name?.[0] ?? "?").toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-winelio-gray">{ref.first_name ?? "—"}</span>
                      </div>
                    ))}
                    {(directReferrals ?? []).length < 3 && (
                      <Link href="/network" className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-winelio-orange transition-colors">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                        <span className="text-xs text-winelio-gray">Inviter</span>
                      </Link>
                    )}
                  </div>
                  {networkCount > 0 && (
                    <p className="text-xs text-winelio-gray mt-1">
                      <span className="font-bold text-winelio-orange">{networkCount}</span> membres au total (5 niveaux)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>
        </section>
      </div>
    </>
  );
}

/* ── Composants partagés ── */

function KpiCard({ numValue, suffix = "", decimals = 0, label, variant, icon, delay = 0 }: {
  numValue: number; suffix?: string; decimals?: number; label: string; variant: "orange" | "amber"; icon: string; delay?: number;
}) {
  const isOrange = variant === "orange";
  return (
    <Card className="animate-fade-up card-lift !rounded-2xl shadow-sm" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isOrange ? "bg-winelio-orange/10" : "bg-winelio-amber/10"}`}>
          <svg className={`w-5 h-5 ${isOrange ? "text-winelio-orange" : "text-winelio-amber"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div>
          <p className="text-[28px] font-extrabold text-winelio-dark leading-none">
            <AnimatedCounter to={numValue} suffix={suffix} decimals={decimals} delay={delay} />
          </p>
          <p className="text-xs text-winelio-gray font-semibold mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DesktopKpiCard({ numValue, suffix = "", decimals = 0, label, sub, trend, sparkline, icon, accentColor, delay = 0 }: {
  numValue: number; suffix?: string; decimals?: number; label: string; sub?: string; trend?: string;
  sparkline?: number[]; icon: string; accentColor: "orange" | "amber"; delay?: number;
}) {
  const isOrange = accentColor === "orange";
  const color = isOrange ? "text-winelio-orange" : "text-winelio-amber";
  const bg = isOrange ? "bg-winelio-orange/10" : "bg-winelio-amber/10";
  const maxSpark = sparkline ? Math.max(...sparkline, 1) : 1;

  return (
    <Card className="animate-fade-up card-lift !rounded-2xl shadow-sm overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5 flex flex-col gap-3 relative">
        {/* icône déco en fond */}
        <div className={`absolute top-3 right-3 opacity-[0.06] ${color}`}>
          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div className="flex items-center gap-2 text-winelio-gray">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
            <svg className={`w-4 h-4 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-extrabold text-winelio-dark leading-none">
              <AnimatedCounter to={numValue} suffix={suffix} decimals={decimals} delay={delay} />
            </p>
            {sub && <p className={`text-xs mt-1 font-medium ${color}`}>{sub}</p>}
          </div>
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs font-bold ${bg} ${color} px-2 py-1 rounded-full`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
              {trend}
            </div>
          )}
          {sparkline && (
            <div className="flex items-end gap-0.5 h-8 w-14">
              {sparkline.map((v, i) => (
                <div key={i} className={`flex-1 rounded-t-sm ${isOrange ? "bg-winelio-orange/30" : "bg-winelio-amber/30"}`}
                  style={{ height: `${Math.max((v / maxSpark) * 100, 8)}%` }} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionChip({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex-shrink-0 flex items-center gap-2 bg-winelio-orange/10 text-winelio-orange px-4 py-2.5 rounded-full font-bold text-sm active:bg-winelio-orange/20 transition-colors border border-winelio-orange/20"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

function ActivityItem({ event, alternate }: { event: FeedEvent; alternate: boolean }) {
  const userName = "user" in event ? event.user : "Winelio";
  const amount = "amount" in event ? event.amount : undefined;
  const initials = userName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-2xl ${alternate ? "bg-winelio-light" : "bg-white"} shadow-sm`}>
      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${alternate ? "bg-winelio-amber/20 text-winelio-amber" : "bg-winelio-orange/20 text-winelio-orange"}`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-winelio-dark leading-snug">{getActivityLabel(event)}</p>
        <p className="text-[11px] text-winelio-gray mt-0.5">{formatRelativeTime(event.timestamp)}</p>
      </div>
      {amount !== undefined && (
        <div className="bg-winelio-orange/10 px-2.5 py-1 rounded-full shrink-0">
          <span className="text-winelio-orange font-bold text-xs">+{Number(amount).toFixed(0)} €</span>
        </div>
      )}
    </div>
  );
}

function DesktopActivityItem({ event }: { event: FeedEvent }) {
  const amount = "amount" in event ? event.amount : undefined;
  const isReco = event.kind === "reco_validated" || event.kind === "commission_received";
  const isMember = event.kind === "new_referral" || event.kind === "referral_sponsored";
  return (
    <div className="flex gap-3 relative z-10">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
        isReco ? "bg-winelio-orange/15 text-winelio-orange" :
        isMember ? "bg-winelio-amber/15 text-winelio-amber" :
        "bg-gray-100 text-winelio-gray"
      }`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          {isReco ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          )}
        </svg>
      </div>
      <div className="flex-1 pt-1">
        <p className="text-sm font-semibold text-winelio-dark">{getActivityLabel(event)}</p>
        {amount !== undefined && (
          <p className="text-xs text-winelio-gray mt-0.5">
            <span className="font-bold text-winelio-orange">+{Number(amount).toFixed(0)} €</span>
          </p>
        )}
        <span className="text-xs text-winelio-gray/70 mt-0.5 block">{formatRelativeTime(event.timestamp)}</span>
      </div>
    </div>
  );
}

function RecoStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") {
    return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-600">Validé</span>;
  }
  if (status === "CANCELLED" || status === "REJECTED") {
    return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-500">Annulé</span>;
  }
  return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-winelio-amber/15 text-winelio-amber">En cours</span>;
}

function getActivityLabel(event: FeedEvent): string {
  switch (event.kind) {
    case "new_referral": return `${"user" in event ? event.user : ""} a rejoint votre réseau`;
    case "reco_validated": return `${"user" in event ? event.user : ""} a validé une recommandation`;
    case "commission_received": return `Commission reçue — ${"user" in event ? event.user : ""}`;
    case "referral_sponsored": return `${"user" in event ? event.user : ""} a parrainé un nouveau membre`;
    case "big_commission": return `Commission importante — ${"user" in event ? event.user : ""}`;
    case "top_sponsor": return `${"user" in event ? event.user : ""} — top parrain de la semaine`;
    case "top_reco": return `Plus grosse reco du jour`;
    default: return "";
  }
}
