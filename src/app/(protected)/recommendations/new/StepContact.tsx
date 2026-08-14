import { SelfProfile } from "./types";

interface StepContactProps {
  selfProfile: SelfProfile | null;
}

const CheckIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const SelectedBadge = () => (
  <div className="w-5 h-5 rounded-full bg-winelio-orange flex items-center justify-center shrink-0">
    <CheckIcon />
  </div>
);

export const StepContact = ({ selfProfile }: StepContactProps) => {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Votre demande</h2>
        <p className="mt-1 text-sm text-winelio-gray">La recommandation sera créée uniquement avec les informations de votre propre compte.</p>
      </div>
      <div className="space-y-4">
        <div className="flex w-full items-center gap-4 rounded-2xl border-2 border-winelio-orange bg-winelio-orange/5 p-4 text-left shadow-sm shadow-winelio-orange/10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-winelio-dark">Pour moi-même</p>
            {selfProfile ? (
              <p className="truncate text-sm text-winelio-gray">{selfProfile.first_name} {selfProfile.last_name} · {selfProfile.email}</p>
            ) : (
              <p className="text-sm text-winelio-gray">Chargement de votre profil…</p>
            )}
          </div>
          <SelectedBadge />
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
          <p className="font-semibold">Confidentialité des proches</p>
          <p className="mt-1">
            Winelio ne permet pas de saisir les coordonnées d&apos;une autre personne. Pour recommander un professionnel à un proche, partagez-lui votre invitation Winelio : il créera lui-même sa demande et décidera des informations qu&apos;il souhaite transmettre.
          </p>
        </div>
      </div>
    </div>
  );
};
