"use client";

import { createClient } from "@/lib/supabase/client";
import { StepTimeline } from "@/components/step-timeline";
import { RecommendationFollowupCard } from "@/components/recommendation-followup-card";
import { SavePaymentMethodDialog } from "@/components/save-payment-method-dialog";
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
  step: { name: string; description: string | null; completion_role: string | null; order_index: number } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:          "En attente",
  ACCEPTED:         "Acceptée",
  CONTACT_MADE:     "Contact établi",
  MEETING_SCHEDULED:"RDV fixé",
  QUOTE_SUBMITTED:  "Devis soumis",
  QUOTE_VALIDATED:  "Devis validé",
  PAYMENT_RECEIVED: "Paiement reçu",
  COMPLETED:        "Terminée",
  REJECTED:         "Refusée",
  EXPIRED:          "Expirée",
  TRANSFERRED:      "Transférée",
};

const STATUS_CONFIG: Record<string, {
  pill: string; dot: string;
  heroBg: string; heroText: string;
}> = {
  PENDING:          { pill: "bg-amber-50 text-amber-700 ring-amber-200",         dot: "bg-amber-400",       heroBg: "from-amber-600 to-amber-700",        heroText: "text-amber-100" },
  ACCEPTED:         { pill: "bg-blue-50 text-blue-700 ring-blue-200",            dot: "bg-blue-400",        heroBg: "from-blue-600 to-blue-700",          heroText: "text-blue-100" },
  CONTACT_MADE:     { pill: "bg-indigo-50 text-indigo-700 ring-indigo-200",      dot: "bg-indigo-400",      heroBg: "from-indigo-600 to-indigo-700",      heroText: "text-indigo-100" },
  MEETING_SCHEDULED:{ pill: "bg-violet-50 text-violet-700 ring-violet-200",      dot: "bg-violet-400",      heroBg: "from-violet-600 to-violet-700",      heroText: "text-violet-100" },
  QUOTE_SUBMITTED:  { pill: "bg-orange-50 text-winelio-orange ring-orange-200",  dot: "bg-winelio-orange",  heroBg: "from-winelio-orange to-winelio-amber",heroText: "text-orange-100" },
  QUOTE_VALIDATED:  { pill: "bg-orange-50 text-winelio-orange ring-orange-300",  dot: "bg-winelio-amber",   heroBg: "from-winelio-orange to-winelio-amber",heroText: "text-orange-100" },
  PAYMENT_RECEIVED: { pill: "bg-teal-50 text-teal-700 ring-teal-200",            dot: "bg-teal-500",        heroBg: "from-teal-600 to-teal-700",          heroText: "text-teal-100" },
  COMPLETED:        { pill: "bg-green-50 text-green-700 ring-green-200",         dot: "bg-green-500",       heroBg: "from-green-600 to-emerald-700",      heroText: "text-green-100" },
  REJECTED:         { pill: "bg-red-50 text-red-600 ring-red-200",               dot: "bg-red-400",         heroBg: "from-red-500 to-red-600",            heroText: "text-red-100" },
  EXPIRED:          { pill: "bg-gray-50 text-gray-500 ring-gray-200",            dot: "bg-gray-300",        heroBg: "from-gray-500 to-gray-600",          heroText: "text-gray-100" },
  TRANSFERRED:      { pill: "bg-blue-50 text-blue-600 ring-blue-200",            dot: "bg-blue-400",        heroBg: "from-blue-500 to-blue-600",          heroText: "text-blue-100" },
};

const URGENCY_CONFIG: Record<string, { label: string; icon: string; pill: string }> = {
  urgent:   { label: "Urgent",   icon: "🔴", pill: "bg-red-50 text-red-600 ring-red-200" },
  high:     { label: "Élevée",   icon: "🟠", pill: "bg-orange-50 text-winelio-orange ring-orange-200" },
  normal:   { label: "Normal",   icon: "🟡", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  low:      { label: "Faible",   icon: "🟢", pill: "bg-green-50 text-green-700 ring-green-200" },
  flexible: { label: "Flexible", icon: "🔵", pill: "bg-blue-50 text-blue-600 ring-blue-200" },
};

function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return (
    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center shrink-0">
      <span className="text-xl font-black text-white uppercase">{init}</span>
    </div>
  );
}

function InfoBlock({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-winelio-light text-winelio-gray">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-winelio-gray/50 mb-0.5">{label}</p>
        {children}
      </div>
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
  const [refusing, setRefusing] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [expectedDelay, setExpectedDelay] = useState<string>("");
  const [customExpectedDate, setCustomExpectedDate] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/whoami").then(async (res) => {
      if (!res.ok) return;
      const { user } = await res.json();
      if (!user?.id) return;
      setUserId(user.id);
      const profileRes = await fetch(`/api/profile/payment-method-status`);
      if (profileRes.ok) {
        const { hasPaymentMethod: hpm } = await profileRes.json();
        setHasPaymentMethod(!!hpm);
      }
    });
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch(`/api/recommendations/${id}`);
    if (res.ok) {
      const { recommendation: rec, steps: recSteps } = await res.json();
      const normalize = (v: unknown) => (Array.isArray(v) ? v[0] ?? null : v);
      setRecommendation({
        ...rec,
        contact: normalize(rec.contact) as RecommendationDetail["contact"],
        professional: normalize(rec.professional) as RecommendationDetail["professional"],
        referrer: normalize(rec.referrer) as RecommendationDetail["referrer"],
      });
      const mapped = (recSteps as StepRow[]).map((s) => ({
        ...s,
        step: Array.isArray(s.step) ? s.step[0] ?? null : s.step,
      })) as StepRow[];
      mapped.sort((a, b) => (a.step?.order_index ?? 0) - (b.step?.order_index ?? 0));
      setSteps(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentStep = steps.find((s) => !s.completed_at);
  const currentStepIndex = currentStep?.step?.order_index ?? (steps.length > 0 ? (steps[steps.length - 1].step?.order_index ?? 0) + 1 : 1);

  const canComplete = () => {
    if (!currentStep || !userId || !recommendation) return false;
    const role = currentStep.step?.completion_role;
    if (role === "REFERRER" && userId !== recommendation.referrer_id) return false;
    if (role === "PROFESSIONAL" && userId !== recommendation.professional_id) return false;
    return true;
  };

  const DELAY_PRESETS: Record<string, number> = {
    "7d":  7 * 24 * 60 * 60 * 1000,
    "4w":  28 * 24 * 60 * 60 * 1000,
    "3m":  90 * 24 * 60 * 60 * 1000,
    "6m":  180 * 24 * 60 * 60 * 1000,
    "12m": 365 * 24 * 60 * 60 * 1000,
  };

  const computeExpectedDate = (): string | null => {
    if (expectedDelay === "custom") {
      return customExpectedDate ? new Date(customExpectedDate).toISOString() : null;
    }
    const offset = DELAY_PRESETS[expectedDelay];
    if (!offset) return null;
    return new Date(Date.now() + offset).toISOString();
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
          quote_amount: (currentStep?.step?.order_index ?? 0) === 5 ? quoteAmount : undefined,
          expected_completion_at: (currentStep?.step?.order_index ?? 0) === 5 ? computeExpectedDate() : undefined,
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
    setExpectedDelay("");
    setCustomExpectedDate("");
  };

  const handleRefuse = async () => {
    if (!recommendation) return;
    setRefusing(true);
    try {
      await fetch(`/api/recommendations/${recommendation.id}/refuse`, { method: "POST" });
    } catch (err) {
      console.error("Erreur refus:", err);
    }
    await fetchData();
    setRefusing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-28 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-3xl bg-gray-100 animate-pulse" />
        <div className="h-96 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100">
          <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-lg font-bold text-winelio-dark">Recommandation introuvable</p>
        <button
          onClick={() => router.push("/recommendations")}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-winelio-orange hover:text-winelio-amber transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Retour aux recommandations
        </button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[recommendation.status] ?? STATUS_CONFIG.EXPIRED;
  const contactName = recommendation.contact
    ? [recommendation.contact.first_name, recommendation.contact.last_name].filter(Boolean).join(" ") || "Contact inconnu"
    : "Contact inconnu";
  const completedCount = steps.filter((s) => s.completed_at).length;
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const urgency = recommendation.urgency_level ? URGENCY_CONFIG[recommendation.urgency_level] : null;

  return (
    <div className="">

      {/* ── Back ── */}
      <button
        onClick={() => router.push("/recommendations")}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Recommandations
      </button>

      {/* ── Hero card ── */}
      <div className="mb-4 overflow-hidden rounded-3xl shadow-lg">
        {/* Gradient hero */}
        <div className={`relative bg-gradient-to-br ${cfg.heroBg} px-6 py-7 sm:px-8`}>
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/8 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-black/10 blur-2xl" />

          <div className="relative">
            {/* Top row: avatar + name + status */}
            <div className="flex items-start gap-4">
              <Avatar name={contactName} />
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-black text-white truncate sm:text-2xl">{contactName}</h1>
                {recommendation.contact?.email && (() => {
                  const isPro = userId === recommendation.professional_id;
                  const shouldMask = isPro && hasPaymentMethod === false;
                  if (shouldMask) {
                    return (
                      <div className="mt-1 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                        <span className="text-sm select-none blur-sm">
                          ••••••@••••.com · 06 •• •• •• ••
                        </span>
                        <button
                          type="button"
                          onClick={() => setPaymentDialogOpen(true)}
                          className="text-[10px] font-bold uppercase tracking-wider bg-white text-winelio-orange px-2 py-1 rounded-md hover:bg-winelio-light transition-colors"
                        >
                          💳 Accéder
                        </button>
                      </div>
                    );
                  }
                  return (
                    <p className={`mt-0.5 text-sm truncate ${cfg.heroText}`}>
                      {recommendation.contact.email}
                      {recommendation.contact.phone ? ` · ${recommendation.contact.phone}` : ""}
                    </p>
                  );
                })()}
                <p className={`mt-1 text-xs ${cfg.heroText} opacity-70`}>
                  {new Date(recommendation.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {STATUS_LABELS[recommendation.status] ?? recommendation.status}
              </span>
            </div>

            {/* Progress bar */}
            {steps.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold ${cfg.heroText} opacity-70`}>Progression</span>
                  <span className="text-xs font-black text-white tabular-nums">{progressPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/70 transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className={`mt-1.5 text-xs ${cfg.heroText} opacity-60`}>{completedCount} sur {steps.length} étapes complétées</p>
              </div>
            )}
          </div>
        </div>

        {/* Info section */}
        <div className="bg-white px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoBlock
              label="Professionnel"
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
            >
              <p className="font-bold text-winelio-dark text-sm">
                {recommendation.professional
                  ? [recommendation.professional.first_name, recommendation.professional.last_name].filter(Boolean).join(" ") || "Inconnu"
                  : "Inconnu"}
              </p>
              {recommendation.professional?.company && (
                <p className="text-xs text-winelio-gray mt-0.5">
                  {(recommendation.professional.company as { name: string }).name}
                </p>
              )}
            </InfoBlock>

            <InfoBlock
              label="Recommandé par"
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>}
            >
              <p className="font-bold text-winelio-dark text-sm">
                {recommendation.referrer
                  ? [recommendation.referrer.first_name, recommendation.referrer.last_name].filter(Boolean).join(" ") || "Inconnu"
                  : "Inconnu"}
              </p>
            </InfoBlock>

            {urgency && (
              <InfoBlock
                label="Urgence"
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
              >
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${urgency.pill}`}>
                  {urgency.icon} {urgency.label}
                </span>
              </InfoBlock>
            )}

            {recommendation.project_description && (
              <div className={`${urgency ? "sm:col-span-2" : "col-span-full"} rounded-xl bg-winelio-light p-4`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-winelio-gray/50 mb-2">Description du projet</p>
                <p className="text-sm text-winelio-dark leading-relaxed">{recommendation.project_description}</p>
              </div>
            )}
          </div>

          {/* Amount card */}
          {recommendation.amount != null && (
            <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-r from-winelio-dark to-[#3d4042] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Montant du deal</p>
                  <p className="mt-1 text-3xl font-black text-white tabular-nums">
                    {recommendation.amount.toLocaleString("fr-FR")}
                    <span className="ml-1 text-xl font-semibold text-white/50">€</span>
                  </p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-winelio-orange/20">
                  <svg className="w-7 h-7 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {recommendation.amount > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/10">
                    <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber" />
                  </div>
                  <span className="text-xs text-white/40 font-medium">~{Math.round(recommendation.amount * 0.06).toLocaleString("fr-FR")} € commissions estimées</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Timeline card ── */}
      <div className="rounded-3xl border border-winelio-gray/8 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-winelio-gray/6 px-6 py-5 sm:px-8 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-winelio-dark">Suivi des étapes</h2>
            <p className="mt-0.5 text-sm text-winelio-gray">Workflow de la recommandation</p>
          </div>
          {steps.length > 0 && (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-winelio-orange/10">
              <span className="text-sm font-black text-winelio-orange">{progressPct}%</span>
            </div>
          )}
        </div>

        <div className="px-6 py-6 sm:px-8">
          <RecommendationFollowupCard
            recommendationId={recommendation.id}
            isProfessional={userId === recommendation.professional_id}
          />
          <StepTimeline
            steps={steps.map((s) => ({
              id: s.id,
              step_id: s.step_id,
              step_order: s.step?.order_index ?? 0,
              step_name: s.step?.name ?? `Étape ${s.step?.order_index ?? 0}`,
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
            <div className="mt-8 overflow-hidden rounded-2xl border border-winelio-orange/20 bg-gradient-to-br from-winelio-orange/8 via-winelio-amber/5 to-transparent">
              <div className="px-5 pt-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-winelio-orange/15 shrink-0">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-winelio-orange opacity-60" />
                      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-winelio-orange" />
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-winelio-dark text-sm">Étape à valider</p>
                    <p className="text-xs text-winelio-gray">{currentStep.step?.name ?? `Étape ${currentStep.step?.order_index ?? 0}`}</p>
                  </div>
                </div>

                {(currentStep?.step?.order_index ?? 0) === 5 && (
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-bold text-winelio-dark">
                      Montant du devis (€)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-winelio-gray">€</span>
                      <input
                        type="number"
                        value={quoteAmount}
                        onChange={(e) => setQuoteAmount(e.target.value)}
                        placeholder="0,00"
                        min="0"
                        step="0.01"
                        className="w-full rounded-xl border border-winelio-gray/20 bg-white pl-9 pr-4 py-3 text-sm font-semibold focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 transition-all"
                      />
                    </div>
                  </div>
                )}
                {(currentStep?.step?.order_index ?? 0) === 5 && (
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-bold text-winelio-dark">
                      Délai estimé avant fin des travaux + paiement
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        { value: "7d",     label: "Sous 7 jours" },
                        { value: "4w",     label: "2-4 semaines" },
                        { value: "3m",     label: "1-3 mois" },
                        { value: "6m",     label: "3-6 mois" },
                        { value: "12m",    label: "Plus de 6 mois" },
                        { value: "custom", label: "Date précise" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setExpectedDelay(opt.value)}
                          className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all ${
                            expectedDelay === opt.value
                              ? "border-winelio-orange bg-winelio-orange/5 text-winelio-orange"
                              : "border-gray-200 bg-white text-winelio-dark hover:border-winelio-orange/30"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {expectedDelay === "custom" && (
                      <input
                        type="date"
                        value={customExpectedDate}
                        onChange={(e) => setCustomExpectedDate(e.target.value)}
                        min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        max={new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        className="mt-2 w-full rounded-xl border border-winelio-gray/20 bg-white px-4 py-2 text-sm"
                      />
                    )}
                    <p className="mt-2 text-xs text-winelio-gray">
                      Nous vous enverrons un rappel à cette date pour confirmer la fin du chantier. Vous pourrez le reporter si besoin.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-5 pb-5 flex items-center gap-3">
                <button
                  onClick={handleCompleteStep}
                  disabled={
                    completing ||
                    refusing ||
                    ((currentStep?.step?.order_index ?? 0) === 5 && (!quoteAmount || !computeExpectedDate()))
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-winelio-orange px-5 py-3 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none cursor-pointer"
                >
                  {completing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Validation en cours…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Valider cette étape
                    </>
                  )}
                </button>

                {/* Boutons Refuser + Transférer — visibles pour le pro à l'étape d'acceptation (étape 2) */}
                {recommendation && userId === recommendation.professional_id && (currentStep?.step?.order_index ?? 0) === 2 && (
                  <>
                    <button
                      onClick={() => setTransferDialogOpen(true)}
                      disabled={refusing || completing}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      Transférer
                    </button>
                    <button
                      onClick={handleRefuse}
                      disabled={refusing || completing}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {refusing ? (
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      Refuser
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Transfer Dialog ── */}
          {transferDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-winelio-dark">Transférer la recommandation</h3>
                <p className="mt-1 text-sm text-winelio-gray">
                  Saisissez l'ID du professionnel à qui vous souhaitez transférer cette recommandation.
                </p>
                {transferError && (
                  <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                    {transferError}
                  </div>
                )}
                <input
                  type="text"
                  value={transferTarget}
                  onChange={(e) => { setTransferTarget(e.target.value); setTransferError(null); }}
                  placeholder="ID du professionnel"
                  className="mt-4 w-full rounded-xl border border-winelio-gray/20 bg-white px-4 py-3 text-sm font-semibold focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 transition-all"
                />
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    onClick={() => { setTransferDialogOpen(false); setTransferTarget(""); setTransferError(null); }}
                    className="rounded-xl border border-winelio-gray/20 px-5 py-2.5 text-sm font-semibold text-winelio-gray hover:bg-winelio-light transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={async () => {
                      if (!transferTarget.trim() || !recommendation) return;
                      setTransferring(true);
                      setTransferError(null);
                      try {
                        const res = await fetch(`/api/recommendations/${recommendation.id}/transfer`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ target_professional_id: transferTarget.trim() }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setTransferError(data.error || "Erreur lors du transfert");
                        } else {
                          setTransferDialogOpen(false);
                          setTransferTarget("");
                          await fetchData();
                        }
                      } catch {
                        setTransferError("Erreur réseau lors du transfert");
                      }
                      setTransferring(false);
                    }}
                    disabled={transferring || !transferTarget.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {transferring ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Transfert en cours…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        Transférer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Refusée par le pro — visible pour le referrer */}
          {recommendation?.status === "CANCELLED" && userId === recommendation.referrer_id && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-red-100 bg-red-50">
              <div className="px-6 py-5 flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-red-700 text-sm">Le professionnel a décliné cette recommandation</p>
                  <p className="mt-1 text-xs text-red-500">
                    Vous pouvez recommander un autre professionnel pour ce même contact.
                  </p>
                </div>
              </div>
              <div className="px-6 pb-5">
                <button
                  onClick={() => router.push("/recommendations/new")}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/20 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Recommander un autre pro
                </button>
              </div>
            </div>
          )}

          {/* All done state */}
          {steps.length > 0 && !currentStep && recommendation?.status !== "CANCELLED" && (
            <div className="mt-8 flex flex-col items-center rounded-2xl bg-green-50 py-8 px-6 text-center ring-1 ring-green-100">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/30">
                <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-bold text-green-700">Toutes les étapes sont complétées !</p>
              <p className="mt-1 text-sm text-green-600">Cette recommandation est terminée avec succès.</p>
            </div>
          )}
        </div>
      </div>

      <SavePaymentMethodDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        onSaved={() => {
          setHasPaymentMethod(true);
          setPaymentDialogOpen(false);
        }}
      />
    </div>
  );
}
