import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingModal } from "@/components/onboarding-modal";
import { Card, CardContent } from "@/components/ui/card";
import { NetworkFeed } from "@/components/network-feed";
import { FeedEvent, formatUserName } from "@/lib/feed-utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch dashboard data in parallel
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: recoThisMonth },
    { data: wallet },
    { count: totalRecos },
    { count: completedRecos },
  ] = await Promise.all([
    // Recommendations this month
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gte("created_at", startOfMonth),
    // Wallet summary
    supabase
      .from("user_wallet_summaries")
      .select("total_earned")
      .eq("user_id", user.id)
      .single(),
    // Total recommendations (all time) for success rate
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id),
    // Completed recommendations for success rate
    supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .eq("status", "COMPLETED"),
  ]);

  // Fetch profile to check onboarding
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  // Super admin role stored in app_metadata (JWT), no extra DB query needed
  const isSuperAdmin = user.app_metadata?.role === "super_admin";
  const needsOnboarding = !isSuperAdmin && (!profile?.first_name || !profile?.last_name);

  // Total network members across ALL levels (up to 5) recursively
  // On collecte aussi les IDs pour le feed
  const allNetworkIds: string[] = [];
  let networkCount = 0;
  let currentLevelIds = [user.id];
  for (let lvl = 1; lvl <= 5; lvl++) {
    if (currentLevelIds.length === 0) break;
    const { data: lvlMembers } = await supabase
      .from("profiles")
      .select("id")
      .in("sponsor_id", currentLevelIds);
    if (!lvlMembers || lvlMembers.length === 0) break;
    networkCount += lvlMembers.length;
    allNetworkIds.push(...lvlMembers.map((m) => m.id));
    currentLevelIds = lvlMembers.map((m) => m.id);
  }

  // --- Feed réseau ---
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Highlights globaux via RPC
  const { data: globalRaw } = await supabase.rpc("get_global_highlights");
  // La RPC retourne un tableau d'objets jsonb sans champ `id` — on l'injecte ici
  type GlobalHighlightRaw = Omit<FeedEvent, "id"> & { id?: string }
  const globalEvents: FeedEvent[] = ((globalRaw as GlobalHighlightRaw[] | null) ?? []).map(
    (e, i) => ({
      ...e,
      id: e.id ?? `global-${i}-${Date.now()}`,
    } as FeedEvent)
  );

  // Événements personnels
  const personalEvents: FeedEvent[] = [];

  if (allNetworkIds.length > 0) {
    const [
      { data: newReferrals },
      { data: validatedRecos },
      { data: bigCommissions },
      { data: referralSponsored },
    ] = await Promise.all([
      // Nouveaux filleuls directs
      supabase
        .from("profiles")
        .select("id, first_name, last_name, city, created_at, sponsor_id")
        .eq("sponsor_id", user.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Recos validées dans le réseau
      supabase
        .from("recommendations")
        .select("id, referrer_id, amount, created_at")
        .in("referrer_id", allNetworkIds)
        .eq("status", "COMPLETED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Commissions > 100€ dans le réseau
      supabase
        .from("commission_transactions")
        .select("id, user_id, amount, created_at")
        .in("user_id", allNetworkIds)
        .gt("amount", 100)
        .eq("status", "EARNED")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),

      // Filleuls qui ont eux-mêmes parrainé quelqu'un
      supabase
        .from("profiles")
        .select("id, first_name, last_name, city, created_at, sponsor_id")
        .in("sponsor_id", allNetworkIds)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Récupérer les profils des référents pour recos et commissions
    const referrerIds = [
      ...(validatedRecos?.map((r) => r.referrer_id) ?? []),
      ...(bigCommissions?.map((c) => c.user_id) ?? []),
      ...(referralSponsored?.map((p) => p.sponsor_id).filter(Boolean) ?? []),
    ];
    const uniqueReferrerIds = [...new Set(referrerIds)];
    const profilesMap: Record<string, { first_name: string | null; last_name: string | null; city: string | null }> = {};

    if (uniqueReferrerIds.length > 0) {
      const { data: refProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, city")
        .in("id", uniqueReferrerIds);
      refProfiles?.forEach((p) => { profilesMap[p.id] = p; });
    }

    // Transformer en FeedEvent
    newReferrals?.forEach((p) => {
      personalEvents.push({
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
      personalEvents.push({
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
      personalEvents.push({
        id: `cr-${c.id}`,
        kind: "commission_received",
        user: formatUserName(prof?.first_name ?? null, prof?.last_name ?? null),
        city: prof?.city ?? null,
        amount: c.amount,
        timestamp: c.created_at,
      });
    });

    referralSponsored?.forEach((p) => {
      const sponsorProf = p.sponsor_id ? profilesMap[p.sponsor_id] : null;
      if (sponsorProf) {
        personalEvents.push({
          id: `rs-${p.id}`,
          kind: "referral_sponsored",
          user: formatUserName(sponsorProf.first_name, sponsorProf.last_name),
          city: sponsorProf.city,
          timestamp: p.created_at,
        });
      }
    });

    // Trier par timestamp décroissant
    personalEvents.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  const totalEarned = wallet?.total_earned ?? 0;
  const successRate =
    totalRecos && totalRecos > 0
      ? Math.round(((completedRecos ?? 0) / totalRecos) * 100)
      : 0;


  return (
    <div>
      {needsOnboarding && <OnboardingModal userId={user.id} />}


      <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark mb-6">
        Tableau de bord
      </h2>

      {/* Welcome card - en premier */}
      <Card className="!rounded-2xl text-center">
        <CardContent className="p-6 sm:p-12 flex flex-col items-center">
          <div className="w-20 h-20 mb-6 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-winelio-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-winelio-dark mb-2">
            Bienvenue sur Winelio !
          </h3>
          <p className="text-winelio-gray mb-6 max-w-md mx-auto">
            Commencez par recommander un professionnel de confiance ou invitez
            des membres dans votre réseau.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/recommendations/new" className="px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-center">
              Faire une recommandation
            </a>
            <a href="/network" className="px-6 py-3 border-2 border-winelio-orange text-winelio-orange font-semibold rounded-xl hover:bg-winelio-orange hover:text-white transition-colors text-center">
              Inviter un membre
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
        <StatCard
          title="Recommandations"
          value={String(recoThisMonth ?? 0)}
          subtitle="Ce mois-ci"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          title="Gains"
          value={`${Number(totalEarned).toFixed(2)} EUR`}
          subtitle="Total gagné"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          title="Réseau"
          value={String(networkCount ?? 0)}
          subtitle="Membres"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
        <StatCard
          title="Taux de succès"
          value={`${successRate}%`}
          subtitle="Recommandations validées"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      <NetworkFeed
        initialGlobalEvents={globalEvents}
        initialPersonalEvents={personalEvents}
        networkIds={allNetworkIds}
        userId={user.id}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <Card className="!rounded-2xl">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-winelio-gray">{title}</span>
          <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-winelio-orange"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d={icon}
              />
            </svg>
          </div>
        </div>
        <p className="text-2xl font-bold text-winelio-dark">{value}</p>
        <p className="text-sm text-winelio-gray mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
