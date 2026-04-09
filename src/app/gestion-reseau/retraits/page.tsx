import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  validateWithdrawal,
  rejectWithdrawal,
  markWithdrawalPaid,
} from "../actions";

const STATUS = {
  PROCESSING: { label: "Approuvé",   color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  COMPLETED:  { label: "Payé",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  REJECTED:   { label: "Rejeté",     color: "text-red-400 bg-red-400/10 border-red-400/20" },
  PENDING:    { label: "En attente", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
} as Record<string, { label: string; color: string }>;

export default async function AdminRetraits() {
  const { data: withdrawals } = await supabaseAdmin
    .from("withdrawals")
    .select(`*, user:profiles!user_id(id, first_name, last_name, email)`)
    .order("created_at", { ascending: true });

  const pending = (withdrawals ?? []).filter((w) => w.status === "PENDING");
  const others  = (withdrawals ?? []).filter((w) => w.status !== "PENDING");

  const totalPending = pending.reduce((s, w) => s + (w.amount ?? 0), 0);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Retraits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} en attente · {others.length} traités
          </p>
        </div>
        {pending.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total à verser</p>
            <p className="text-lg font-bold text-emerald-400">{totalPending.toLocaleString("fr-FR")} €</p>
          </div>
        )}
      </div>

      {/* En attente */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          En attente
          <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 text-[10px] px-1.5 py-0.5 rounded-md">{pending.length}</span>
        </h2>

        {pending.length === 0 ? (
          <div className="bg-card rounded-xl border border-border px-5 py-10 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="text-sm text-muted-foreground">Aucun retrait en attente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((w) => {
              const user = Array.isArray(w.user) ? w.user[0] : w.user;
              return (
                <div key={w.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar initiales */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {(user?.first_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Demande du {new Date(w.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-emerald-400 shrink-0">
                      {w.amount?.toLocaleString("fr-FR")} €
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        await validateWithdrawal(formData.get("withdrawalId") as string, formData.get("userId") as string);
                      }}
                      className="flex-1"
                    >
                      <input type="hidden" name="withdrawalId" value={w.id} />
                      <input type="hidden" name="userId" value={user?.id ?? ""} />
                      <button
                        type="submit"
                        className="w-full text-sm font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 px-4 py-2 rounded-lg transition-colors"
                      >
                        ✓ Approuver le versement
                      </button>
                    </form>
                    <form
                      action={async (formData: FormData) => {
                        "use server";
                        await rejectWithdrawal(
                          formData.get("withdrawalId") as string,
                          formData.get("userId") as string,
                          (formData.get("reason") as string) || "Refusé par l'admin"
                        );
                      }}
                      className="flex gap-2 flex-1"
                    >
                      <input type="hidden" name="withdrawalId" value={w.id} />
                      <input type="hidden" name="userId" value={user?.id ?? ""} />
                      <input
                        name="reason"
                        placeholder="Motif de rejet (optionnel)"
                        className="flex-1 text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground min-w-0"
                      />
                      <button
                        type="submit"
                        className="shrink-0 text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 px-4 py-2 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historique */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          Historique
          <span className="text-[10px] text-muted-foreground">({others.length})</span>
        </h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {others.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun retrait traité</p>
          ) : (
            <div className="divide-y divide-border">
              {others.slice(0, 50).map((w) => {
                const user = Array.isArray(w.user) ? w.user[0] : w.user;
                const st = STATUS[w.status] ?? { label: w.status, color: "text-muted-foreground bg-muted border-border" };
                return (
                  <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">
                      {w.amount?.toLocaleString("fr-FR")} €
                    </p>
                    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-md border ${st.color}`}>
                      {st.label}
                    </span>
                    {w.status === "PROCESSING" && (
                      <form
                        action={async (formData: FormData) => {
                          "use server";
                          await markWithdrawalPaid(formData.get("withdrawalId") as string, formData.get("userId") as string);
                        }}
                      >
                        <input type="hidden" name="withdrawalId" value={w.id} />
                        <input type="hidden" name="userId" value={user?.id ?? ""} />
                        <button
                          type="submit"
                          className="text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Marquer payé
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
