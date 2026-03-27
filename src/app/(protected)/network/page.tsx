import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NetworkTree } from "@/components/network-tree";
import { NetworkGraph } from "@/components/network-graph";

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

  // Count total network members (all levels, recursive via commission_transactions)
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

  // Wallet summary
  const { data: wallet } = await supabase
    .from("user_wallet_summaries")
    .select("*")
    .eq("user_id", user.id)
    .single();

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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-kiparlo-dark">Mon Reseau</h2>
        <Link
          href="/network/stats"
          className="text-sm text-kiparlo-orange hover:text-kiparlo-amber transition-colors font-medium"
        >
          Stats detaillees
        </Link>
      </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total membres"
            value={String(totalReferrals ?? 0)}
            subtitle="Filleuls directs"
            icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
          <StatCard
            title="Gains reseau"
            value={`${totalNetworkGains.toFixed(2)} EUR`}
            subtitle="Total cumule"
            icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <StatCard
            title="Commissions ce mois"
            value={`${commissionsThisMonth.toFixed(2)} EUR`}
            subtitle={now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            icon="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"
          />
          <StatCard
            title="Croissance"
            value={`${growth >= 0 ? "+" : ""}${growth}%`}
            subtitle="vs mois precedent"
            icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </div>

        {/* Sponsor code section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h3 className="text-lg font-semibold text-kiparlo-dark mb-4">
            Mon code parrain
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-kiparlo-light border-2 border-dashed border-kiparlo-orange rounded-xl px-8 py-4 text-center">
              <span className="text-3xl font-extrabold tracking-widest bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent">
                {sponsorCode}
              </span>
            </div>
            <div className="flex gap-3">
              <CopyButton code={sponsorCode} />
              <ShareButton code={sponsorCode} />
            </div>
          </div>
        </div>

        {/* Direct referrals */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-kiparlo-dark">
              Mes filleuls directs
              <span className="ml-2 text-sm font-normal text-kiparlo-gray">
                ({totalReferrals ?? 0})
              </span>
            </h3>
            <Link
              href="/network/stats"
              className="text-sm text-kiparlo-orange hover:text-kiparlo-amber transition-colors font-medium"
            >
              Voir les stats detaillees
            </Link>
          </div>

          {referralsWithStats.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-kiparlo-orange/10 to-kiparlo-amber/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-kiparlo-orange"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <p className="text-kiparlo-gray">
                Aucun filleul pour le moment. Partagez votre code parrain !
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {referralsWithStats.map((ref) => (
                <div
                  key={ref.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-kiparlo-light hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber flex items-center justify-center text-white font-bold text-sm">
                      {[ref.first_name, ref.last_name]
                        .filter(Boolean)
                        .map((n: string) => n[0])
                        .join("")
                        .toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="font-semibold text-kiparlo-dark">
                        {((ref.first_name ?? "") + " " + (ref.last_name ?? "")).trim() || "Sans nom"}
                      </p>
                      <p className="text-xs text-kiparlo-gray">
                        Inscrit le{" "}
                        {new Date(ref.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="font-bold text-kiparlo-dark">
                        {ref.sub_referrals}
                      </p>
                      <p className="text-xs text-kiparlo-gray">Filleuls</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-kiparlo-orange">
                        {ref.total_commissions.toFixed(2)} EUR
                      </p>
                      <p className="text-xs text-kiparlo-gray">Commissions</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Network graph - visual pyramid */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mb-8">
          <h3 className="text-lg font-semibold text-kiparlo-dark mb-4">
            Vue graphique du reseau
          </h3>
          <NetworkGraph
            userId={user.id}
            userName={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()}
          />
        </div>

        {/* Network tree - detailed list */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-kiparlo-dark mb-6">
            Liste detaillee du reseau
          </h3>
          <NetworkTree userId={user.id} />
        </div>
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
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-kiparlo-gray">{title}</span>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-kiparlo-orange/10 to-kiparlo-amber/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-kiparlo-orange"
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
      <p className="text-2xl font-bold text-kiparlo-dark">{value}</p>
      <p className="text-sm text-kiparlo-gray mt-1">{subtitle}</p>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  return (
    <button
      data-copy-code={code}
      className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
      onClick={undefined}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
      Copier
    </button>
  );
}

function ShareButton({ code }: { code: string }) {
  return (
    <button
      data-share-code={code}
      className="inline-flex items-center gap-2 px-5 py-3 border-2 border-kiparlo-orange text-kiparlo-orange font-semibold rounded-xl hover:bg-kiparlo-orange hover:text-white transition-colors cursor-pointer"
      onClick={undefined}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
      Partager
    </button>
  );
}
