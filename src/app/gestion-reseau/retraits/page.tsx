import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  validateWithdrawal,
  rejectWithdrawal,
  markWithdrawalPaid,
} from "../actions";

export default async function AdminRetraits() {
  const { data: withdrawals } = await supabaseAdmin
    .from("withdrawals")
    .select(`*, user:profiles!user_id(id, first_name, last_name, email)`)
    .order("created_at", { ascending: true });

  const pending = (withdrawals ?? []).filter((w) => w.status === "PENDING");
  const others = (withdrawals ?? []).filter((w) => w.status !== "PENDING");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Retraits</h1>

      {/* PENDING */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        En attente ({pending.length})
      </h2>
      <div className="bg-gray-900 rounded-xl border border-white/5 divide-y divide-white/5 mb-8">
        {pending.length === 0 && (
          <p className="p-4 text-gray-500 text-sm">Aucun retrait en attente.</p>
        )}
        {pending.map((w) => {
          const user = Array.isArray(w.user) ? w.user[0] : w.user;
          return (
            <div key={w.id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—"}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(w.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <p className="text-lg font-bold text-emerald-400">
                {w.amount?.toLocaleString("fr-FR")} €
              </p>
              <div className="flex gap-2">
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const wId = formData.get("withdrawalId") as string;
                    const uId = formData.get("userId") as string;
                    await validateWithdrawal(wId, uId);
                  }}
                >
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <input type="hidden" name="userId" value={user?.id ?? ""} />
                  <button
                    type="submit"
                    className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✓ Valider
                  </button>
                </form>
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const wId = formData.get("withdrawalId") as string;
                    const uId = formData.get("userId") as string;
                    const reason = formData.get("reason") as string;
                    await rejectWithdrawal(wId, uId, reason || "Refusé par l'admin");
                  }}
                  className="flex gap-1"
                >
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <input type="hidden" name="userId" value={user?.id ?? ""} />
                  <input
                    name="reason"
                    placeholder="Motif de rejet"
                    className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white placeholder-gray-600 w-36"
                  />
                  <button
                    type="submit"
                    className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ✕ Rejeter
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {/* Historique */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Historique
      </h2>
      <div className="bg-gray-900 rounded-xl border border-white/5 divide-y divide-white/5">
        {others.slice(0, 50).map((w) => {
          const user = Array.isArray(w.user) ? w.user[0] : w.user;
          const statusColors: Record<string, string> = {
            approved: "text-emerald-400",
            paid: "text-blue-400",
            rejected: "text-red-400",
          };
          return (
            <div key={w.id} className="px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-white">{`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—"}</p>
                <p className="text-xs text-gray-500">
                  {new Date(w.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <p className="text-sm font-medium text-white">
                {w.amount?.toLocaleString("fr-FR")} €
              </p>
              <span
                className={`text-xs font-medium ${statusColors[w.status] ?? "text-gray-400"}`}
              >
                {w.status}
              </span>
              {w.status === "approved" && (
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const wId = formData.get("withdrawalId") as string;
                    const uId = formData.get("userId") as string;
                    await markWithdrawalPaid(wId, uId);
                  }}
                >
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <input type="hidden" name="userId" value={user?.id ?? ""} />
                  <button
                    type="submit"
                    className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    Marquer payé
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
