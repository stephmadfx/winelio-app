export function ProfessionalRating({ average }: { average: number }) {
  return <span className="inline-flex items-center gap-2" aria-label={`${average.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sur 5 étoiles`}>
    <span className="relative inline-block text-base leading-none tracking-wide" aria-hidden="true">
      <span className="text-gray-300">★★★★★</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-amber-500" style={{ width: `${Math.max(0, Math.min(5, average)) * 20}%` }}>★★★★★</span>
    </span>
    <span className="text-sm">{average.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5</span>
  </span>;
}
