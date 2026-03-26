import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WalletCard } from "@/components/wallet-card";

type Transaction = {
  id: string;
  type: "commission" | "withdrawal";
  amount: number;
  created_at: string;
  status: string;
  description?: string;
};

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const statusLabels: Record<string, string> = {
  completed: "Completee",
  pending: "En attente",
  processing: "En cours",
  failed: "Echouee",
  cancelled: "Annulee",
};

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch wallet summary
  const { data: wallet } = await supabase
    .from("user_wallet_summaries")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const totalWins = wallet?.total_wins ?? 0;

  // Fetch recent commissions
  const { data: commissions } = await supabase
    .from("commission_transactions")
    .select("id, amount, created_at, status, description")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch recent withdrawals
  const { data: withdrawals } = await supabase
    .from("withdrawals")
    .select("id, amount, created_at, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Merge and sort transactions
  const transactions: Transaction[] = [
    ...(commissions ?? []).map((c) => ({
      id: c.id,
      type: "commission" as const,
      amount: c.amount,
      created_at: c.created_at,
      status: c.status,
      description: c.description,
    })),
    ...(withdrawals ?? []).map((w) => ({
      id: w.id,
      type: "withdrawal" as const,
      amount: w.amount,
      created_at: w.created_at,
      status: w.status,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-kiparlo-dark">Wallet</h1>
          <p className="text-kiparlo-gray text-sm mt-1">
            Gerez vos gains et retraits
          </p>
        </div>
        <Link
          href="/wallet/withdraw"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19V5m0 0l-4 4m4-4l4 4"
            />
          </svg>
          Demander un retrait
        </Link>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <WalletCard
          title="Disponible"
          amount={available}
          currency="EUR"
          color="orange"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <WalletCard
          title="En attente"
          amount={pending}
          currency="EUR"
          color="amber"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <WalletCard
          title="Total Wins"
          amount={totalWins}
          currency="EUR"
          color="dark"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-kiparlo-dark">
            Dernieres transactions
          </h2>
          <Link
            href="/wallet/history"
            className="text-sm text-kiparlo-orange hover:underline font-medium"
          >
            Voir tout
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-kiparlo-gray text-sm">
            Aucune transaction pour le moment.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {transactions.map((tx) => (
              <li
                key={`${tx.type}-${tx.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      tx.type === "commission"
                        ? "bg-green-100"
                        : "bg-kiparlo-orange/10"
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${
                        tx.type === "commission"
                          ? "text-green-600"
                          : "text-kiparlo-orange"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          tx.type === "commission"
                            ? "M12 4v16m0-16l-4 4m4-4l4 4"
                            : "M12 20V4m0 16l-4-4m4 4l4-4"
                        }
                      />
                    </svg>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-kiparlo-dark">
                      {tx.type === "commission"
                        ? "Commission"
                        : "Retrait"}
                    </p>
                    <p className="text-xs text-kiparlo-gray">
                      {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`text-sm font-semibold ${
                      tx.type === "commission"
                        ? "text-green-600"
                        : "text-kiparlo-orange"
                    }`}
                  >
                    {tx.type === "commission" ? "+" : "-"}
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                    }).format(tx.amount)}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      statusColors[tx.status] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {statusLabels[tx.status] ?? tx.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
