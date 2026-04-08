"use client";

interface Step {
  id: string;
  step_id: string;
  step_order: number;
  step_name: string;
  step_description: string | null;
  completed: boolean;
  completed_at: string | null;
  data: Record<string, unknown> | null;
  completion_role: string | null;
}

interface StepTimelineProps {
  steps: Step[];
  currentStepOrder: number;
}

const STEP_ICONS: Record<number, React.ReactNode> = {
  1: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
  2: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  3: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>,
  4: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  5: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  6: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
  7: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  8: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>,
};

export function StepTimeline({ steps, currentStepOrder }: StepTimelineProps) {
  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <div className="relative">
      {steps.map((step, idx) => {
        const isCompleted = step.completed;
        const isCurrent = step.step_order === currentStepOrder;
        const isFuture = step.step_order > currentStepOrder;
        const isLast = idx === steps.length - 1;
        const icon = STEP_ICONS[step.step_order];

        return (
          <div key={step.id} className="relative flex gap-4">
            {/* Column: connector + circle */}
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  isCompleted
                    ? "border-green-500 bg-green-500 text-white shadow-sm shadow-green-500/30"
                    : isCurrent
                      ? "border-winelio-orange bg-winelio-orange text-white shadow-md shadow-winelio-orange/30"
                      : "border-gray-200 bg-white text-gray-300"
                }`}
              >
                {isCompleted ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isCurrent ? (
                  <>
                    <span className="absolute inset-0 rounded-full animate-ping bg-winelio-orange/30" />
                    {icon ?? <span className="text-xs font-bold">{step.step_order}</span>}
                  </>
                ) : (
                  icon ?? <span className="text-xs font-medium text-gray-400">{step.step_order}</span>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="mt-1 w-0.5 flex-1 min-h-6">
                  <div className="h-full w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`w-full rounded-full transition-all duration-500 ${
                        isCompleted ? "h-full bg-gradient-to-b from-green-400 to-green-500" : "h-0"
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
              <div
                className={`rounded-xl p-4 transition-all duration-200 ${
                  isCompleted
                    ? "bg-green-50/60 ring-1 ring-green-100"
                    : isCurrent
                      ? "bg-winelio-orange/5 ring-1 ring-winelio-orange/20"
                      : "bg-gray-50/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold text-sm leading-tight ${
                        isCompleted
                          ? "text-green-700"
                          : isCurrent
                            ? "text-winelio-dark"
                            : "text-gray-400"
                      }`}
                    >
                      {step.step_name}
                    </p>
                    {step.step_description && (
                      <p className={`mt-0.5 text-xs leading-relaxed ${isFuture ? "text-gray-300" : "text-gray-500"}`}>
                        {step.step_description}
                      </p>
                    )}
                  </div>

                  {isCurrent && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-winelio-orange/15 px-2 py-0.5 text-xs font-semibold text-winelio-orange">
                      <span className="h-1.5 w-1.5 rounded-full bg-winelio-orange" />
                      En cours
                    </span>
                  )}
                </div>

                {/* Completed date & data */}
                {isCompleted && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {step.completed_at && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {new Date(step.completed_at).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    )}
                    {step.data && Object.keys(step.data).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5 w-full">
                        {Object.entries(step.data).map(([key, value]) => (
                          <span key={key} className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step counter badge */}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-300 font-medium">
                    Étape {step.step_order}/{steps.length}
                  </span>
                  {step.completion_role && (
                    <span className="text-xs text-gray-300">
                      {step.completion_role === "PROFESSIONAL" ? "👷 Pro" : "👤 Référent"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Overall progress summary */}
      {steps.length > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-winelio-light px-4 py-3">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-winelio-orange to-green-500 transition-all duration-700"
              style={{ width: `${Math.round((completedCount / steps.length) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-winelio-dark tabular-nums shrink-0">
            {completedCount}/{steps.length}
          </span>
        </div>
      )}
    </div>
  );
}
