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

export function StepTimeline({ steps, currentStepOrder }: StepTimelineProps) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-kiparlo-gray/20" />

      <div className="space-y-6">
        {steps.map((step) => {
          const isCompleted = step.completed;
          const isCurrent = step.step_order === currentStepOrder;
          const isFuture = step.step_order > currentStepOrder;

          return (
            <div key={step.id} className="relative flex items-start gap-4">
              {/* Circle indicator */}
              <div
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                  isCompleted
                    ? "border-green-500 bg-green-500 text-white"
                    : isCurrent
                      ? "border-kiparlo-orange bg-kiparlo-orange/10 text-kiparlo-orange"
                      : "border-kiparlo-gray/30 bg-kiparlo-light text-kiparlo-gray/50"
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : isCurrent ? (
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiparlo-orange opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-kiparlo-orange" />
                  </span>
                ) : (
                  <span className="text-xs font-medium">{step.step_order}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <p
                  className={`font-semibold ${
                    isCompleted
                      ? "text-green-700"
                      : isCurrent
                        ? "text-kiparlo-dark"
                        : "text-kiparlo-gray/50"
                  }`}
                >
                  {step.step_name}
                </p>
                {step.step_description && (
                  <p
                    className={`mt-0.5 text-sm ${
                      isFuture ? "text-kiparlo-gray/40" : "text-kiparlo-gray"
                    }`}
                  >
                    {step.step_description}
                  </p>
                )}
                {isCompleted && step.completed_at && (
                  <p className="mt-1 text-xs text-green-600">
                    Complété le{" "}
                    {new Date(step.completed_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
                {isCompleted && step.data && Object.keys(step.data).length > 0 && (
                  <div className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                    {Object.entries(step.data).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium">{key} :</span>{" "}
                        {String(value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
