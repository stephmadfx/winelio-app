import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import {
  suspendUser,
  reactivateUser,
  adjustCommission,
} from "../../actions";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [profileRes, walletRes, recoCountRes, sponsorCountRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("*, sponsor:profiles!sponsor_id(full_name)")
        .eq("id", id)
        .single(),
      supabaseAdmin
        .from("user_wallet_summaries")
        .select("*")
        .eq("user_id", id)
        .single(),
      supabaseAdmin
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", id),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", id),
    ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data;
  const wallet = walletRes.data;
  const sponsor = Array.isArray(profile.sponsor) ? profile.sponsor[0] : profile.sponsor;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/gestion-reseau/utilisateurs" className="text-gray-500 hover:text-white text-sm">
          ← Utilisateurs
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold">{profile.full_name}</h1>
        {profile.is_suspended && (
          <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Suspendu</span>
        )}
      </div>

      {/* Profil */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Type</p>
          <p className="text-white">{profile.is_professional ? "Professionnel" : "Particulier"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Parrain</p>
          <p className="text-white">{sponsor?.full_name ?? "Aucun"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Code parrainage</p>
          <p className="text-white font-mono">{profile.sponsor_code ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Filleuls directs</p>
          <p className="text-white">{sponsorCountRes.count ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Recommandations émises</p>
          <p className="text-white">{recoCountRes.count ?? 0}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Inscrit le</p>
          <p className="text-white">
            {new Date(profile.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>

      {/* Wallet */}
      {wallet && (
        <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Wallet
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Total gagné</p>
              <p className="text-white font-medium">
                {wallet.total_earned?.toLocaleString("fr-FR")} €
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Disponible</p>
              <p className="text-emerald-400 font-bold">
                {wallet.available?.toLocaleString("fr-FR")} €
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Retiré</p>
              <p className="text-white">{wallet.total_withdrawn?.toLocaleString("fr-FR")} €</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">En attente</p>
              <p className="text-yellow-400">{wallet.pending_commissions?.toLocaleString("fr-FR")} €</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Actions admin
        </h2>

        {/* Suspendre / Réactiver */}
        <form
          action={async () => {
            "use server";
            if (profile.is_suspended) {
              await reactivateUser(id);
            } else {
              await suspendUser(id);
            }
          }}
        >
          <button
            type="submit"
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${
              profile.is_suspended
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {profile.is_suspended ? "✓ Réactiver le compte" : "⊘ Suspendre le compte"}
          </button>
        </form>

        {/* Ajuster commission */}
        <form
          action={async (formData: FormData) => {
            "use server";
            const amount = parseFloat(formData.get("amount") as string);
            const reason = formData.get("reason") as string;
            if (!isNaN(amount) && reason) {
              await adjustCommission(id, amount, reason);
            }
          }}
          className="flex gap-2 items-end flex-wrap"
        >
          <div>
            <label className="text-xs text-gray-500 block mb-1">Montant (€)</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              placeholder="ex: 50"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-28"
              required
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">Motif</label>
            <input
              name="reason"
              placeholder="Motif de l'ajustement"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-full"
              required
            />
          </div>
          <button
            type="submit"
            className="text-sm bg-kiparlo-orange/20 text-kiparlo-orange hover:bg-kiparlo-orange/30 px-4 py-1.5 rounded-lg transition-colors"
          >
            + Appliquer commission
          </button>
        </form>
      </div>
    </div>
  );
}
