export type GeoStatus = "idle" | "loading" | "granted" | "denied" | "unavailable";

interface GeoStatusBannerProps {
  status: GeoStatus;
  radius: number;
  onRequestGeo: () => void;
  onRadiusChange: (r: number) => void;
}

export const GeoStatusBanner = ({ status, radius, onRequestGeo, onRadiusChange }: GeoStatusBannerProps) => {
  if (status === "idle") return (
    <button onClick={onRequestGeo} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-winelio-orange/40 px-4 py-3.5 text-sm font-semibold text-winelio-orange hover:border-winelio-orange hover:bg-winelio-orange/5 transition-all cursor-pointer">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Trouver les pros autour de moi
    </button>
  );
  if (status === "loading") return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-winelio-orange/8 px-4 py-3.5 text-sm font-medium text-winelio-orange">
      <div className="w-4 h-4 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
      Localisation en cours...
    </div>
  );
  if (status === "unavailable") return (
    <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">Position indisponible</p>
        <p className="mt-0.5 text-xs text-amber-700">Saisissez une ville ou un code postal ci-dessous pour trouver les professionnels de votre secteur.</p>
      </div>
      <button onClick={onRequestGeo} type="button" className="text-xs shrink-0 font-medium text-amber-900 underline hover:no-underline cursor-pointer">
        Réessayer
      </button>
    </div>
  );
  if (status === "denied") return (
    <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">Géolocalisation refusée</p>
        <p className="mt-0.5 text-xs text-red-600">Pas de souci : entrez simplement une ville ou un code postal ci-dessous pour afficher les professionnels.</p>
      </div>
      <button onClick={onRequestGeo} type="button" className="text-xs shrink-0 font-medium text-red-800 underline hover:no-underline cursor-pointer">
        Réessayer
      </button>
    </div>
  );
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-green-50 border border-green-100 px-4 py-3.5">
      <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="text-sm font-semibold text-green-800 flex-1">Position activée</span>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-green-700">Rayon :</label>
        <select value={radius} onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="rounded-lg border border-green-200 bg-white px-2 py-1 text-xs text-green-800 focus:outline-none cursor-pointer">
          {[5,10,25,50,100].map((r) => <option key={r} value={r}>{r} km</option>)}
          <option value={99999}>Toute la France</option>
        </select>
      </div>
    </div>
  );
};
