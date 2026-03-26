"use client";

import { createClient } from "@/lib/supabase/client";
import { createCommissions } from "@/lib/commission";
import { StepTimeline } from "@/components/step-timeline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RecommendationDetail {
  id: string;
  status: string;
  deal_amount: number | null;
  description: string | null;
  urgency: string | null;
  created_at: string;
  referrer_id: string;
  professional_id: string;
  contact: { first_name: string; last_name: string; email: string; phone: string } | null;
  professional: { first_name: string; last_name: string; company: { name: string } | null } | null;
  referrer: { first_name: string; last_name: string } | null;
}

interface StepRow {
  id: string;
  step_id: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
  data: Record<string, unknown> | null;
  step: { name: string; description: string | null; completion_role: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  completed: "Terminee",
  cancelled: "Annulee",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-kiparlo-orange/15 text-kiparlo-orange",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function RecommendationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params.id as string;

  const [recommendation, setRecommendation] = useState<RecommendationDetail | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [supabase]);

  const fetchData = async () => {
    setLoading(true);

    const { data: rec } = await supabase
      .from("recommendations")
      .select(
        `id, status, deal_amount, description, urgency, created_at, referrer_id, professional_id,
         contact:contacts(first_name, last_name, email, phone),
         professional:profiles!recommendations_professional_id_fkey(first_name, last_name, company:companies(name)),
         referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name)`
      )
      .eq("id", id)
      .single();

    if (rec) {
      const normalize = (v: unknown) => (Array.isArray(v) ? v[0] ?? null : v);
      setRecommendation({
        ...rec,
        contact: normalize(rec.contact) as RecommendationDetail["contact"],
        professional: normalize(rec.professional) as RecommendationDetail["professional"],
        referrer: normalize(rec.referrer) as RecommendationDetail["referrer"],
      });
    }

    const { data: recSteps } = await supabase
      .from("recommendation_steps")
      .select("id, step_id, step_order, completed, completed_at, data, step:steps(name, description, completion_role)")
      .eq("recommendation_id", id)
      .order("step_order");

    if (recSteps) {
      setSteps(
        recSteps.map((s) => ({
          ...s,
          step: Array.isArray(s.step) ? s.step[0] ?? null : s.step,
        })) as StepRow[]
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentStep = steps.find((s) => !s.completed);
  const currentStepOrder = currentStep?.step_order ?? (steps.length > 0 ? steps[steps.length - 1].step_order + 1 : 1);

  const canComplete = () => {
    if (!currentStep || !userId || !recommendation) return false;
    const role = currentStep.step?.completion_role;
    if (role === "referrer" && userId !== recommendation.referrer_id) return false;
    if (role === "professional" && userId !== recommendation.professional_id) return false;
    return true;
  };

  const handleCompleteStep = async () => {
    if (!currentStep || !recommendation) return;
    setCompleting(true);

    const stepData: Record<string, unknown> = {};
    const isQuoteStep = currentStep.step_order === 5;
    const isValidationStep = currentStep.step_order === 6;

    if (isQuoteStep) {
      const amount = parseFloat(quoteAmount);
      if (isNaN(amount) || amount <= 0) {
        setCompleting(false);
        return;
      }
      stepData.montant = amount;

      // Update deal_amount on recommendation
      await supabase
        .from("recommendations")
        .update({ deal_amount: amount })
        .eq("id", recommendation.id);
    }

    // Complete the step
    await supabase
      .from("recommendation_steps")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        data: Object.keys(stepData).length > 0 ? stepData : null,
      })
      .eq("id", currentStep.id);

    // If validation step, trigger commission logic
    if (isValidationStep && recommendation.deal_amount) {
      try {
        // Get the professional's compensation plan
        const { data: proProfile } = await supabase
          .from("profiles")
          .select("compensation_plan_id")
          .eq("id", recommendation.professional_id)
          .single();

        if (proProfile?.compensation_plan_id) {
          await createCommissions(
            supabase,
            recommendation.id,
            recommendation.deal_amount,
            recommendation.referrer_id,
            proProfile.compensation_plan_id
          );
        }
      } catch (err) {
        console.error("Erreur calcul commissions:", err);
      }
    }

    // Update recommendation status
    const allCompleted = steps.every(
      (s) => s.completed || s.id === currentStep.id
    );

    await supabase
      .from("recommendations")
      .update({
        status: allCompleted ? "completed" : "in_progress",
      })
      .eq("id", recommendation.id);

    await fetchData();
    setCompleting(false);
    setQuoteAmount("");
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-kiparlo-gray">Chargement...</div>
    );
  }

  if (!recommendation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-kiparlo-gray">Recommandation introuvable</p>
        <button
          onClick={() => router.push("/recommendations")}
          className="mt-4 text-sm text-kiparlo-orange hover:text-kiparlo-amber"
        >
          Retour aux recommandations
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back link */}
      <button
        onClick={() => router.push("/recommendations")}
        className="mb-6 text-sm text-kiparlo-gray hover:text-kiparlo-dark"
      >
        &larr; Retour aux recommandations
      </button>

      {/* Header card */}
      <div className="mb-8 rounded-xl border border-kiparlo-gray/10 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-kiparlo-dark">
              {recommendation.contact
                ? `${recommendation.contact.first_name} ${recommendation.contact.last_name}`
                : "Contact inconnu"}
            </h1>
            {recommendation.contact?.email && (
              <p className="mt-1 text-sm text-kiparlo-gray">
                {recommendation.contact.email}
                {recommendation.contact.phone
                  ? ` - ${recommendation.contact.phone}`
                  : ""}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              STATUS_COLORS[recommendation.status] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {STATUS_LABELS[recommendation.status] ?? recommendation.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-kiparlo-gray/10 pt-4">
          <div>
            <p className="text-xs text-kiparlo-gray">Professionnel</p>
            <p className="font-medium text-kiparlo-dark">
              {recommendation.professional
                ? `${recommendation.professional.first_name} ${recommendation.professional.last_name}`
                : "Inconnu"}
            </p>
            {recommendation.professional?.company && (
              <p className="text-sm text-kiparlo-gray">
                {(recommendation.professional.company as { name: string }).name}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-kiparlo-gray">Recommande par</p>
            <p className="font-medium text-kiparlo-dark">
              {recommendation.referrer
                ? `${recommendation.referrer.first_name} ${recommendation.referrer.last_name}`
                : "Inconnu"}
            </p>
          </div>
        </div>

        {recommendation.deal_amount != null && (
          <div className="mt-4 border-t border-kiparlo-gray/10 pt-4">
            <p className="text-xs text-kiparlo-gray">Montant du deal</p>
            <p className="text-lg font-bold text-kiparlo-orange">
              {recommendation.deal_amount.toLocaleString("fr-FR")} EUR
            </p>
          </div>
        )}

        {recommendation.description && (
          <div className="mt-4 border-t border-kiparlo-gray/10 pt-4">
            <p className="text-xs text-kiparlo-gray">Description</p>
            <p className="mt-1 text-sm text-kiparlo-dark">
              {recommendation.description}
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-kiparlo-gray/60">
          Creee le{" "}
          {new Date(recommendation.created_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-kiparlo-gray/10 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold text-kiparlo-dark">
          Suivi des etapes
        </h2>

        <StepTimeline
          steps={steps.map((s) => ({
            id: s.id,
            step_id: s.step_id,
            step_order: s.step_order,
            step_name: s.step?.name ?? `Etape ${s.step_order}`,
            step_description: s.step?.description ?? null,
            completed: s.completed,
            completed_at: s.completed_at,
            data: s.data,
            completion_role: s.step?.completion_role ?? null,
          }))}
          currentStepOrder={currentStepOrder}
        />

        {/* Complete step action */}
        {currentStep && canComplete() && (
          <div className="mt-8 rounded-lg border border-kiparlo-orange/20 bg-kiparlo-orange/5 p-5">
            <p className="mb-3 font-medium text-kiparlo-dark">
              Completer : {currentStep.step?.name ?? `Etape ${currentStep.step_order}`}
            </p>

            {currentStep.step_order === 5 && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-kiparlo-dark">
                  Montant du devis (EUR)
                </label>
                <input
                  type="number"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-lg border border-kiparlo-gray/20 px-4 py-2.5 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-1 focus:ring-kiparlo-orange"
                />
              </div>
            )}

            <button
              onClick={handleCompleteStep}
              disabled={completing || (currentStep.step_order === 5 && !quoteAmount)}
              className="rounded-lg bg-kiparlo-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-kiparlo-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              {completing ? "Validation..." : "Valider cette etape"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
