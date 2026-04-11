import { Urgency } from "./types";

interface StepProjectProps {
  description: string;
  urgency: Urgency;
  onDescriptionChange: (v: string) => void;
  onUrgencyChange: (v: Urgency) => void;
}

const URGENCY_OPTIONS = [
  { value: "urgent" as const, label: "Urgent", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z", active: "border-red-400 bg-red-50 text-red-700" },
  { value: "normal" as const, label: "Normal", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", active: "border-winelio-orange bg-winelio-orange/8 text-winelio-orange" },
  { value: "flexible" as const, label: "Flexible", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5", active: "border-green-500 bg-green-50 text-green-700" },
];

export const StepProject = ({ description, urgency, onDescriptionChange, onUrgencyChange }: StepProjectProps) => (
  <div>
    <div className="mb-6">
      <h2 className="text-lg font-bold text-winelio-dark">Décrivez le besoin</h2>
      <p className="mt-1 text-sm text-winelio-gray">Donnez un contexte au professionnel pour qu&apos;il prépare sa prise de contact.</p>
    </div>
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-winelio-dark">
          Description du projet <span className="text-winelio-orange">*</span>
        </label>
        <textarea value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={5}
          className="w-full rounded-2xl border border-winelio-gray/20 px-4 py-3 text-sm focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 resize-none transition-colors"
          placeholder="Ex : Mon ami Pierre cherche un plombier pour une fuite dans sa salle de bain. Il est disponible en semaine..." />
        <p className="mt-1.5 text-xs text-winelio-gray/60 text-right">{description.length} caractères</p>
      </div>
      <div>
        <label className="mb-3 block text-sm font-semibold text-winelio-dark">Niveau d&apos;urgence</label>
        <div className="grid grid-cols-3 gap-3">
          {URGENCY_OPTIONS.map((u) => (
            <button key={u.value} onClick={() => onUrgencyChange(u.value)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-sm font-semibold transition-all cursor-pointer ${
                urgency === u.value ? u.active : "border-winelio-gray/15 bg-white text-winelio-gray hover:border-winelio-gray/30"
              }`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={u.icon} />
              </svg>
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);
