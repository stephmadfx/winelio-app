"use client";

import { createClient } from "@/lib/supabase/client";
import { StepTimeline } from "@/components/step-timeline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RecommendationDetail {
  id: string;
  status: string;
  amount: number | null;
  project_description: string | null;
  urgency_level: string | null;
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
  completed_at: string | null;
  data: Record<string, unknown> | null;
  step: { name: string; description: string | null; completion_role: string | null; index: number } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validée",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
  TRANSFERRED: "Transférée",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; banner: string }> = {
  PENDING:     { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400",  banner: "from-amber-500/10 to-amber-500/5" },
  VALIDATED:   { bg: "bg-orange-50", text: "text-kiparlo-orange", dot: "bg-kiparlo-orange", banner: "from-kiparlo-orange/15 to-kiparlo-orange/5" },
  COMPLETED:   { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500",  banner: "from-green-500/15 to-green-500/5" },
  CANCELLED:   { bg: "bg-red-50",    text: "text-red-600",    dot: "bg-red-400",    banner: "from-red-400/10 to-red-400/5" },
  REJECTED:    { bg: "bg-red-50",    text: "text-red-600",    dot: "bg-red-400",    banner: "from-red-400/10 to-red-400/5" },
  EXPIRED:     { bg: "bg-gray-50",   text: "text-gray-500",   dot: "bg-gray-300",   banner: "from-gray-400/10 to-gray-400/5" },
  TRANSFERRED: { bg: "bg-blue-50",   text: "text-blue-600",   dot: "bg-blue-400",   banner: "from-blue-400/10 to-blue-400/5" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent:   { label: "Urgent",   color: "text-red-600 bg-red-50" },
  normal:   { label: "Normal",   color: "text-kiparlo-orange bg-kiparlo-orange/10" },
  flexible: { label: "Flexible", color: "text-green-700 bg-green-50" },
};

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return (
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-kiparlo-orange to-kiparlo-amber flex items-center justify-center shrink-0 shadow-md shadow-kiparlo-orange/20">
      <span className="text-lg font-bold text-white uppercase">{init}</span>
    </div>
  );
}

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
        `id, status, amount, project_description, urgency_level, created_at, referrer_id, professional_id,
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
      .select("id, step_id, completed_at, data, step:steps(name, description, completion_role, index)")
      .eq("recommendation_id", id);

    if (recSteps) {
      const mapped = recSteps.map((s) => ({
        ...s,
        step: Array.isArray(s.step) ? s.step[0] ?? null : s.step,
      })) as StepRow[];
      mapped.sort((a, b) => (a.step?.index ?? 0) - (b.step?.index ?? 0));
      setSteps(mapped);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentStep = steps.find((s) => !s.completed_at);
  const currentStepIndex = currentStep?.step?.index ?? (steps.length > 0 ? (steps[steps.length - 1].step?.index ?? 0) + 1 : 1);

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
    try {
      const res = await fetch("/api/recommendations/complete-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation_id: recommendation.id,
          step_id: currentStep.id,
          quote_amount: (currentStep?.step?.index ?? 0) === 5 ? quoteAmount : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Erreur complétion:", data.error);
      }
    } catch (err) {
      console.error("Erreur réseau:", err);
    }
    await fetchData();
    setCompleting(false);
    setQuoteAmount("");
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-10 w-32 rounded-xl bg-kiparlo-gray/10 animate-pulse" />
        <div className="h-48 rounded-2xl bg-kiparlo-gray/10 animate-pulse" />
        <div className="h-64 rounded-2xl bg-kiparlo-gray/10 animate-pulse" />
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-kiparlo-light">
          <svg className="h-7 w-7 text-kiparlo-gray/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="font-semibold text-kiparlo-dark">Recommandation introuvable</p>
        <button
          onClick={() => router.push("/recommendations")}
          className="mt-4 text-sm font-medium text-kiparlo-orange hover:text-kiparlo-amber transition-colors cursor-pointer"
        >
          Retour aux recommandations
        </button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[recommendation.status] ?? STATUS_CONFIG.EXPIRED;
  const contactName = recommendation.contact
    ? `${recommendation.contact.first_name} ${recommendation.contact.last_name}`
    : "Contact inconnu";
  const completedCount = steps.filter((s) => s.completed_at).length;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">

      {/* ── Back ── */}
      <button
        onClick={() => router.push("/recommendations")}
        className="inline-flex items-center gap-1.5 text-sm text-kiparlo-gray hover:text-kiparlo-dark transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Recommandations
      </button>

      {/* ── Header card ── */}
      <div className="overflow-hidden rounded-2xl border border-kiparlo-gray/10 bg-white shadow-sm">
        {/* Gradient banner */}
        <div className={`bg-gradient-to-r ${cfg.banner} px-6 py-5`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Initials name={contactName} />
              <div>
                <h1 className="text-xl font-bold text-kiparlo-dark">{contactName}</h1>
                {recommendation.contact?.email && (
                  <p className="mt-0.5 text-sm text-kiparlo-gray">
                    {recommendation.contact.email}
                    {recommendation.contact.phone ? ` · ${recommendation.contact.phone}` : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-kiparlo-gray/60">
                  Créée le {new Date(recommendation.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 ${cfg.bg} ${cfg.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
              {STATUS_LABELS[recommendation.status] ?? recommendation.status}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {steps.length > 0 && (
          <div className="px-6 py-3 border-b border-kiparlo-gray/8">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-kiparlo-gray">Progression</span>
              <span className="text-xs font-bold text-kiparlo-dark">{completedCount}/{steps.length} étapes</span>
            </div>
            <div className="h-2 rounded-full bg-kiparlo-gray/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Info grid */}
        <div className="p-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-kiparlo-gray/60 mb-1">Professionnel</p>
            <p className="font-semibold text-kiparlo-dark">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-kiparlo-gray/60 mb-1">Recommandé par</p>
            <p className="font-semibold text-kiparlo-dark">
              {recommendation.referrer
                ? `${recommendation.referrer.first_name} ${recommendation.referrer.last_name}`
                : "Inconnu"}
            </p>
          </div>

          {recommendation.amount != null && (
            <div className="col-span-2 rounded-2xl bg-gradient-to-r from-kiparlo-orange/8 to-kiparlo-amber/8 border border-kiparlo-orange/15 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-kiparlo-orange/70">Montant du deal</p>
                <p className="mt-0.5 text-2xl font-bold text-kiparlo-dark tabular-nums">
                  {recommendation.amount.toLocaleString("fr-FR")} <span className="text-lg text-kiparlo-gray">€</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-kiparlo-orange/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-kiparlo-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          )}

          {recommendation.project_description && (
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-kiparlo-gray/60 mb-2">Description du projet</p>
              <p className="text-sm text-kiparlo-dark leading-relaxed">{recommendation.project_description}</p>
            </div>
          )}

          {recommendation.urgency_level && URGENCY_CONFIG[recommendation.urgency_level] && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-kiparlo-gray/60 mb-1">Urgence</p>
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${URGENCY_CONFIG[recommendation.urgency_level].color}`}>
                {URGENCY_CONFIG[recommendation.urgency_level].label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Timeline card ── */}
      <div className="rounded-2xl border border-kiparlo-gray/10 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-kiparlo-dark">Suivi des étapes</h2>
          {steps.length > 0 && (
            <span className="text-sm font-semibold text-kiparlo-orange">
              {progressPct}%
            </span>
          )}
        </div>

        <StepTimeline
          steps={steps.map((s) => ({
            id: s.id,
            step_id: s.step_id,
            step_order: s.step?.index ?? 0,
            step_name: s.step?.name ?? `Étape ${s.step?.index ?? 0}`,
            step_description: s.step?.description ?? null,
            completed: !!s.completed_at,
            completed_at: s.completed_at,
            data: s.data,
            completion_role: s.step?.completion_role ?? null,
          }))}
          currentStepOrder={currentStepIndex}
        />

        {/* ── Complete step action ── */}
        {currentStep && canComplete() && (
          <div className="mt-8 rounded-2xl border border-kiparlo-orange/20 bg-gradient-to-br from-kiparlo-orange/8 to-kiparlo-amber/5 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-kiparlo-orange/15 flex items-center justify-center shrink-0">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiparlo-orange opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-kiparlo-orange" />
                </span>
              </div>
              <div>
                <p className="font-bold text-kiparlo-dark">Étape à valider</p>
                <p className="text-sm text-kiparlo-gray">{currentStep.step?.name ?? `Étape ${currentStep.step?.index ?? 0}`}</p>
              </div>
            </div>

            {(currentStep?.step?.index ?? 0) === 5 && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-semibold text-kiparlo-dark">
                  Montant du devis (€)
                </label>
                <input
                  type="number"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-kiparlo-gray/20 px-4 py-3 text-sm focus:border-kiparlo-orange focus:outline-none focus:ring-2 focus:ring-kiparlo-orange/15"
                />
              </div>
            )}

            <button
              onClick={handleCompleteStep}
              disabled={completing || ((currentStep?.step?.index ?? 0) === 5 && !quoteAmount)}
              className="inline-flex items-center gap-2 rounded-xl bg-kiparlo-orange px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-kiparlo-orange/25 transition-all hover:bg-kiparlo-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
            >
              {completing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Validation...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Valider cette étape
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
