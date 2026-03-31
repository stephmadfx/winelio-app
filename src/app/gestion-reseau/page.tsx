// src/app/gestion-reseau/page.tsx
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getKPIs() {
  const [membersRes, commissionsRes, recosRes, withdrawalsRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin
        .from("commission_transactions")
        .select("amount")
        .eq("status", "EARNED"),
      supabaseAdmin
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("COMPLETED","CANCELLED")'),
      supabaseAdmin
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING"),
    ]);

  const totalCommissions = (commissionsRes.data ?? []).reduce(
    (sum, t) => sum + (t.amount ?? 0),
    0
  );

  return {
    activeMembers: membersRes.count ?? 0,
    totalCommissions,
    ongoingRecos: recosRes.count ?? 0,
    pendingWithdrawals: withdrawalsRes.count ?? 0,
  };
}

export default async function AdminDashboard() {
  const kpis = await getKPIs();

  const cards = [
    {
      label: "Membres actifs",
      value: kpis.activeMembers.toLocaleString("fr-FR"),
      color: "text-kiparlo-orange",
      bg: "bg-orange-500/10",
    },
    {
      label: "Commissions distribuées",
      value: `${kpis.totalCommissions.toLocaleString("fr-FR")} €`,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Recommandations en cours",
      value: kpis.ongoingRecos.toLocaleString("fr-FR"),
      color: "text-kiparlo-amber",
      bg: "bg-amber-500/10",
    },
    {
      label: "Retraits en attente",
      value: kpis.pendingWithdrawals.toLocaleString("fr-FR"),
      color: kpis.pendingWithdrawals > 0 ? "text-red-400" : "text-gray-400",
      bg: kpis.pendingWithdrawals > 0 ? "bg-red-500/10" : "bg-white/5",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vue d&apos;ensemble</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl p-5 ${card.bg} border border-white/5`}
          >
            <p className="text-xs text-gray-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
