"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Transaction = {
  id: string;
  type: "commission" | "withdrawal";
  amount: number;
  created_at: string;
  status: string;
  description: string;
};

const PAGE_SIZE = 20;

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

export default function WalletHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "commission" | "withdrawal">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const allTx: Transaction[] = [];

    // Fetch commissions
    if (filterType === "all" || filterType === "commission") {
      let query = supabase
        .from("commission_transactions")
        .select("id, amount, created_at, status, description")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterFrom) query = query.gte("created_at", filterFrom);
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");

      const { data } = await query;
      (data ?? []).forEach((c) =>
        allTx.push({
          id: c.id,
          type: "commission",
          amount: c.amount,
          created_at: c.created_at,
          status: c.status,
          description: c.description ?? "Commission",
        })
      );
    }

    // Fetch withdrawals
    if (filterType === "all" || filterType === "withdrawal") {
      let query = supabase
        .from("withdrawals")
        .select("id, amount, created_at, status, payment_method")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      if (filterFrom) query = query.gte("created_at", filterFrom);
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");

      const { data } = await query;
      (data ?? []).forEach((w) =>
        allTx.push({
          id: w.id,
          type: "withdrawal",
          amount: w.amount,
          created_at: w.created_at,
          status: w.status,
          description: `Retrait - ${w.payment_method === "paypal" ? "PayPal" : "Virement bancaire"}`,
        })
      );
    }

    // Sort by date descending
    allTx.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Paginate
    const start = page * PAGE_SIZE;
    const paged = allTx.slice(start, start + PAGE_SIZE);
    setHasMore(start + PAGE_SIZE < allTx.length);
    setTransactions(paged);
    setLoading(false);
  }, [filterType, filterStatus, filterFrom, filterTo, page]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterType, filterStatus, filterFrom, filterTo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/wallet"
          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <svg
            className="w-4 h-4 text-kiparlo-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-kiparlo-dark">
            Historique des transactions
          </h1>
          <p className="text-kiparlo-gray text-sm mt-1">
            Toutes vos commissions et retraits
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-kiparlo-gray mb-1.5">
              Type
            </label>
            <select
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as "all" | "commission" | "withdrawal")
              }
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/30 focus:border-kiparlo-orange"
            >
              <option value="all">Tous</option>
              <option value="commission">Commissions</option>
              <option value="withdrawal">Retraits</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-kiparlo-gray mb-1.5">
              Statut
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/30 focus:border-kiparlo-orange"
            >
              <option value="all">Tous</option>
              <option value="completed">Completee</option>
              <option value="pending">En attente</option>
              <option value="processing">En cours</option>
              <option value="failed">Echouee</option>
              <option value="cancelled">Annulee</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-kiparlo-gray mb-1.5">
              Du
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/30 focus:border-kiparlo-orange"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kiparlo-gray mb-1.5">
              Au
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-kiparlo-dark focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/30 focus:border-kiparlo-orange"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3.5 text-xs font-semibold text-kiparlo-gray uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-kiparlo-gray uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-kiparlo-gray uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-kiparlo-gray uppercase tracking-wider text-right">
                  Montant
                </th>
                <th className="px-6 py-3.5 text-xs font-semibold text-kiparlo-gray uppercase tracking-wider text-center">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-kiparlo-gray"
                  >
                    Chargement...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-kiparlo-gray"
                  >
                    Aucune transaction trouvee.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={`${tx.type}-${tx.id}`}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-kiparlo-dark whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                          tx.type === "commission"
                            ? "bg-green-100 text-green-700"
                            : "bg-kiparlo-orange/10 text-kiparlo-orange"
                        }`}
                      >
                        {tx.type === "commission" ? "Commission" : "Retrait"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-kiparlo-gray">
                      {tx.description}
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${
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
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          statusColors[tx.status] ??
                          "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {statusLabels[tx.status] ?? tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && transactions.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-kiparlo-dark hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Precedent
            </button>
            <span className="text-sm text-kiparlo-gray">
              Page {page + 1}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-kiparlo-dark hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
