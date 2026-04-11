import { Professional } from "./types";

interface ProfessionalListProps {
  professionals: Professional[];
  selectedProId: string | null;
  onSelect: (id: string) => void;
  geoGranted: boolean;
  radius: number;
  onExpandRadius: () => void;
}

const ProInitials = ({ name }: { name: string }) => {
  const parts = name.trim().split(" ");
  const init = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shrink-0">
      <span className="font-bold text-white uppercase text-xs">{init}</span>
    </div>
  );
};

const StarRating = ({ avg, count }: { avg: number; count: number }) => (
  <span className="inline-flex items-center gap-0.5 text-xs">
    {[1,2,3,4,5].map((s) => (
      <svg key={s} className="w-3 h-3" viewBox="0 0 20 20" fill={s <= Math.round(avg) ? "#F7931E" : "#E5E7EB"}>
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
    ))}
    <span className="text-winelio-gray ml-0.5">({count})</span>
  </span>
);

export const ProfessionalList = ({ professionals, selectedProId, onSelect, geoGranted, radius, onExpandRadius }: ProfessionalListProps) => {
  if (professionals.length === 0) return (
    <div className="rounded-2xl border border-winelio-gray/10 bg-white py-12 text-center">
      <p className="text-sm font-medium text-winelio-dark">Aucun résultat</p>
      <p className="mt-1 text-xs text-winelio-gray">
        {geoGranted && radius < 99999 ? `Aucun pro dans un rayon de ${radius} km.` : "Modifiez votre recherche."}
      </p>
      {geoGranted && radius < 99999 && (
        <button onClick={onExpandRadius} className="mt-3 text-sm font-medium text-winelio-orange hover:underline cursor-pointer">
          Élargir à toute la France
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {professionals.map((p) => {
        const label = p.company_alias ?? (p.first_name ?? "Professionnel");
        const isSelected = selectedProId === p.id;
        return (
          <button key={p.id} onClick={() => onSelect(p.id)}
            className={`w-full flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
              isSelected ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10" : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
            }`}>
            <ProInitials name={label} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-winelio-dark text-sm font-mono">{label}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {p.avg_rating !== null && <StarRating avg={p.avg_rating} count={p.review_count} />}
                {p.category_name && <span className="text-xs bg-winelio-orange/10 text-winelio-orange px-2 py-0.5 rounded-full font-medium">{p.category_name}</span>}
                {p.city && <span className="text-xs text-winelio-gray/70">{p.city}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {p.distance !== null && (
                <span className="text-xs font-bold text-winelio-orange bg-winelio-orange/10 px-2.5 py-1 rounded-full">
                  {p.distance < 1 ? `${Math.round(p.distance * 1000)} m` : `${Math.round(p.distance)} km`}
                </span>
              )}
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
