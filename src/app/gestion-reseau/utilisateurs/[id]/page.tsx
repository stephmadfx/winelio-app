import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import {
  suspendUser,
  reactivateUser,
  adjustCommission,
} from "../../actions";
import { ProOnboardingAuditTimeline, type OnboardingEvent } from "@/components/admin/ProOnboardingAuditTimeline";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [profileRes, walletRes, recoCountRes, sponsorCountRes, companyRes, auditRes] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("*, sponsor:profiles!sponsor_id(first_name, last_name)")
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
      supabaseAdmin
        .from("companies")
        .select("name, legal_name, alias, siret, siren, vat_number, email, phone, website, address, city, postal_code, is_verified")
        .eq("owner_id", id)
        .maybeSingle(),
      supabaseAdmin
        .from("pro_onboarding_events")
        .select("id, event_type, ip_address, user_agent, document_id, document_version, document_hash, metadata, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data;
  const wallet = walletRes.data;
  const company = companyRes.data;
  const sponsor = Array.isArray(profile.sponsor) ? profile.sponsor[0] : profile.sponsor;
  const auditEvents: OnboardingEvent[] = (auditRes.data ?? []) as OnboardingEvent[];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/gestion-reseau/utilisateurs" className="text-gray-500 hover:text-white text-sm">
          ← Utilisateurs
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold">{`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "—"}</h1>
        {!profile.is_active && (
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
          <p className="text-white">{`${sponsor?.first_name ?? ""} ${sponsor?.last_name ?? ""}`.trim() || "Aucun"}</p>
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

      {/* Entreprise (pros uniquement) */}
      {profile.is_professional && (
        <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            Entreprise
            {company?.is_verified && (
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-xs normal-case">
                ✓ Vérifiée
              </span>
            )}
          </h2>
          {company ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <p className="text-gray-500 text-xs mb-0.5">Raison sociale</p>
                <p className="text-white">{company.legal_name || company.name || "—"}</p>
                {company.alias && (
                  <p className="text-xs font-mono text-winelio-orange mt-0.5">{company.alias}</p>
                )}
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-0.5">SIRET</p>
                <p className="text-white font-mono text-xs tracking-widest">
                  {company.siret
                    ? company.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4")
                    : <span className="text-gray-600 not-italic font-sans">Non renseigné</span>
                  }
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-0.5">SIREN</p>
                <p className="text-white font-mono text-xs tracking-widest">
                  {company.siren
                    ? company.siren.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")
                    : <span className="text-gray-600 not-italic font-sans">—</span>
                  }
                </p>
              </div>
              {company.vat_number && (
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">N° TVA</p>
                  <p className="text-white font-mono text-xs">{company.vat_number}</p>
                </div>
              )}
              {company.email && (
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Email entreprise</p>
                  <p className="text-white text-xs">{company.email}</p>
                </div>
              )}
              {company.website && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs mb-0.5">Site web</p>
                  <a href={company.website} target="_blank" rel="noopener noreferrer"
                     className="text-winelio-orange text-xs hover:underline truncate block">
                    {company.website}
                  </a>
                </div>
              )}
              {company.address && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs mb-0.5">Adresse</p>
                  <p className="text-white text-xs">{company.address}{company.city ? `, ${company.city}` : ""}{company.postal_code ? ` ${company.postal_code}` : ""}</p>
                </div>
              )}
              {company.siret && (
                <div className="col-span-2 pt-1">
                  <a
                    href={`https://www.societe.com/cgi-bin/search?champs=${company.siret}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-winelio-orange transition-colors"
                  >
                    Vérifier sur societe.com →
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-600 text-sm italic">Aucune entreprise associée</p>
          )}
        </div>
      )}

      {/* Wallet */}
      {wallet && (
        <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Portefeuille
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

      {/* Audit onboarding */}
      {(profile.is_professional || auditEvents.length > 0) && (
        <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Audit onboarding
          </h2>
          <ProOnboardingAuditTimeline events={auditEvents} />
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
            if (!profile.is_active) {
              await reactivateUser(id);
            } else {
              await suspendUser(id);
            }
          }}
        >
          <button
            type="submit"
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${
              !profile.is_active
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {!profile.is_active ? "✓ Réactiver le compte" : "⊘ Suspendre le compte"}
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
            className="text-sm bg-winelio-orange/20 text-winelio-orange hover:bg-winelio-orange/30 px-4 py-1.5 rounded-lg transition-colors"
          >
            + Appliquer commission
          </button>
        </form>
      </div>
    </div>
  );
}
