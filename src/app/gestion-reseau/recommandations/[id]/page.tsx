import { supabaseAdmin } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { advanceRecommendationStep, toggleRecommendationStatus } from "../../actions";

const STEP_NAMES = [
  "Recommandation reçue",
  "Acceptée par le professionnel",
  "Contact établi",
  "Rendez-vous fixé",
  "Devis soumis",
  "Devis validé",
  "Paiement reçu",
  "Affaire terminée",
];

export default async function AdminRecoDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select(
      `*,
       referrer:profiles!referrer_id(id, first_name, last_name, email),
       professional:profiles!professional_id(id, first_name, last_name, email),
       recommendation_steps(id, completed_at, step:steps(order_index, name))`
    )
    .eq("id", id)
    .single();

  if (!reco) notFound();

  const steps = (reco.recommendation_steps ?? []).sort(
    (a: { step: { order_index: number } }, b: { step: { order_index: number } }) =>
      (a.step?.order_index ?? 0) - (b.step?.order_index ?? 0)
  );
  const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
  const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/gestion-reseau/recommandations" className="text-gray-500 hover:text-white text-sm">
          ← Recommandations
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold">Détail recommandation</h1>
      </div>

      {/* Infos générales */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Referrer</p>
          <p className="text-white font-medium">{`${referrer?.first_name ?? ""} ${referrer?.last_name ?? ""}`.trim() || "—"}</p>
          <p className="text-gray-400 text-xs">{referrer?.email}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Professionnel</p>
          <p className="text-white font-medium">{`${professional?.first_name ?? ""} ${professional?.last_name ?? ""}`.trim() || "—"}</p>
          <p className="text-gray-400 text-xs">{professional?.email}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Montant deal</p>
          <p className="text-emerald-400 font-bold">
            {reco.amount ? `${Number(reco.amount).toLocaleString("fr-FR")} €` : "Non défini"}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs mb-0.5">Statut</p>
          <p className="text-white">{reco.status}</p>
        </div>
      </div>

      {/* Étapes */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Étapes du workflow
        </h2>
        <div className="space-y-2">
          {steps.map((step: { id: string; completed_at: string | null; step: { order_index: number; name: string } }) => {
            const isCompleted = !!step.completed_at;
            return (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                isCompleted ? "bg-emerald-500/10" : "bg-white/5"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {isCompleted ? "✓" : step.step?.order_index}
              </div>
              <div className="flex-1">
                <p className={`text-sm ${isCompleted ? "text-emerald-300" : "text-gray-300"}`}>
                  {step.step?.name ?? `Étape ${step.step?.order_index}`}
                </p>
                {step.completed_at && (
                  <p className="text-xs text-gray-500">
                    {new Date(step.completed_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
              {!isCompleted && (
                <form
                  action={async () => {
                    "use server";
                    await advanceRecommendationStep(id, step.id);
                  }}
                >
                  <button
                    type="submit"
                    className="text-xs bg-kiparlo-orange/20 text-kiparlo-orange hover:bg-kiparlo-orange/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Valider →
                  </button>
                </form>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Actions sur le statut */}
      <div className="bg-gray-900 rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Changer le statut
        </h2>
        <div className="flex gap-2 flex-wrap">
          {["PENDING", "ACCEPTED", "CONTACT_MADE", "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED", "COMPLETED", "CANCELLED"].map((s) => (
            <form
              key={s}
              action={async () => {
                "use server";
                await toggleRecommendationStatus(id, s);
              }}
            >
              <button
                type="submit"
                disabled={reco.status === s}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                → {s}
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
