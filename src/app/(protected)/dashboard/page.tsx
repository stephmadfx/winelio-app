import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-kiparlo-dark mb-6">
        Tableau de bord
      </h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Recommandations"
          value="0"
          subtitle="Ce mois-ci"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          title="Gains"
          value="0 EUR"
          subtitle="Total gagné"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <StatCard
          title="Réseau"
          value="0"
          subtitle="Membres"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
        <StatCard
          title="Taux de succès"
          value="0%"
          subtitle="Recommandations validées"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      {/* Empty state */}
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-kiparlo-orange/10 to-kiparlo-amber/10 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-kiparlo-orange"
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
        <h3 className="text-xl font-semibold text-kiparlo-dark mb-2">
          Bienvenue sur Kiparlo !
        </h3>
        <p className="text-kiparlo-gray mb-6 max-w-md mx-auto">
          Commencez par recommander un professionnel de confiance ou invitez
          des membres dans votre réseau.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button className="px-6 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
            Faire une recommandation
          </button>
          <button className="px-6 py-3 border-2 border-kiparlo-orange text-kiparlo-orange font-semibold rounded-xl hover:bg-kiparlo-orange hover:text-white transition-colors">
            Inviter un membre
          </button>
        </div>
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
