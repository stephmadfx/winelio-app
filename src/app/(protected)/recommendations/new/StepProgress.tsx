import { STEPS_META } from "./types";

interface StepProgressProps {
  currentStep: number;
}

export const StepProgress = ({ currentStep }: StepProgressProps) => (
  <div className="mb-8">
    <div className="flex items-center gap-0">
      {STEPS_META.map((s, idx) => (
        <div key={s.number} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              s.number < currentStep
                ? "bg-green-500 text-white"
                : s.number === currentStep
                  ? "bg-winelio-orange text-white shadow-md shadow-winelio-orange/30"
                  : "bg-winelio-light text-winelio-gray/50 border border-winelio-gray/15"
            }`}>
              {s.number < currentStep ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : s.number}
            </div>
            <span className={`text-xs font-medium ${s.number === currentStep ? "text-winelio-dark" : "text-winelio-gray/50"}`}>
              {s.label}
            </span>
          </div>
          {idx < STEPS_META.length - 1 && (
            <div className={`flex-1 h-0.5 mb-5 mx-1 rounded-full transition-colors ${s.number < currentStep ? "bg-green-400" : "bg-winelio-gray/15"}`} />
          )}
        </div>
      ))}
    </div>
  </div>
);
