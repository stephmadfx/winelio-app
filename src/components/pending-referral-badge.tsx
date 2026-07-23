import { PENDING_REFERRAL_HELP } from "@/lib/pending-referral";

export function PendingReferralBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="group relative inline-flex shrink-0 align-middle">
      <span
        tabIndex={0}
        aria-label={PENDING_REFERRAL_HELP}
        className={`inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 font-bold text-violet-700 outline-none ring-violet-300 focus:ring-2 ${
          compact ? "h-4 px-1.5 text-[8px]" : "px-2 py-0.5 text-[9px]"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
        En attente
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2 hidden w-60 -translate-x-1/2 rounded-lg bg-winelio-dark px-3 py-2 text-left text-[10px] font-medium leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block"
      >
        {PENDING_REFERRAL_HELP}
      </span>
    </span>
  );
}
