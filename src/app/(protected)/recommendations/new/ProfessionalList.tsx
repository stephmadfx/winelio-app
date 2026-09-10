import Link from "next/link";
import { ProfessionalRating } from "@/components/professional-rating";
import { Professional, hasPreciseLocation } from "./types";
import { formatRelativeTime } from "@/lib/fake-last-active";

/**
 * Le libellé ne promet que la précision réellement disponible : au numéro de rue
 * on peut annoncer des mètres, à la voie près l'incertitude atteint la centaine
 * de mètres et un chiffre exact serait trompeur.
 */
const formatDistance = (km: number, precision: Professional["geo_precision"]): string => {
  if (km >= 1) return `${Math.round(km)} km`;
  if (precision !== "housenumber") return "< 1 km";
  return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
};

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
        const label = p.company_name ?? (p.first_name ?? "Professionnel");
        const isSelected = selectedProId === p.id;
        return (
          <div key={p.id}
            className={`relative w-full flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
              isSelected ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10" : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
            }`}>
            <button type="button" onClick={() => onSelect(p.id)} aria-pressed={isSelected} aria-label={`Sélectionner ${label}`} className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-winelio-orange" />
            <ProInitials name={label} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold text-winelio-dark text-sm text-left">{label}</p>
                {p.is_claimed && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-green-50 text-green-700 ring-1 ring-green-200 px-1.5 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    Vérifié
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {p.avg_rating !== null ? <><ProfessionalRating average={p.avg_rating} /><Link href={`/professionnels/${p.id}/avis`} target="_blank" rel="noopener noreferrer" className="relative z-10 text-[11px] text-winelio-gray underline" aria-label={`Voir les avis sur ${label} (nouvel onglet)`}>Voir les avis</Link></> : <span className="text-xs text-winelio-gray">Pas encore d’avis</span>}
                {p.category_name && <span className="text-xs bg-winelio-orange/10 text-winelio-orange px-2 py-0.5 rounded-full font-medium">{p.category_name}</span>}
                {p.city && <span className="text-xs text-winelio-gray/70">{p.city}</span>}
                {p.company_source !== "scraped" && (
                  <span className="text-[10px] text-winelio-gray/50">· {formatRelativeTime(p.last_active_at)}</span>
                )}
              </div>
              {p.company_description && (
                <p className="mt-2 text-xs text-winelio-gray italic line-clamp-2 border-t border-gray-100/50 pt-1.5">
                  &ldquo;{p.company_description}&rdquo;
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Deux conditions, et non une seule : il faut une position réelle de
                  l'appareil (sinon le point de départ est un centre de commune) ET une
                  fiche géocodée à son adresse (sinon c'est le point d'arrivée qui est un
                  centre de commune). Dans les deux cas la distance ne veut rien dire —
                  c'est ce qui affichait « 0 m » sur toute la liste. */}
              {geoGranted && p.distance !== null && hasPreciseLocation(p) && (
                <span className="text-xs font-bold text-winelio-orange bg-winelio-orange/10 px-2.5 py-1 rounded-full">
                  {formatDistance(p.distance, p.geo_precision)}
                </span>
              )}
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
