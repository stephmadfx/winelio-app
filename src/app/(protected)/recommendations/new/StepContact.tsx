import { CopyButton, EmailInviteButton, ShareButton } from "@/components/referral-buttons";
import { BeneficiaryChoice, SelfProfile } from "./types";

interface StepContactProps {
  selfProfile: SelfProfile | null;
  sponsorCode: string;
  beneficiaryChoice: BeneficiaryChoice | null;
  onChoose: (choice: BeneficiaryChoice) => void;
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

const UnselectedBadge = () => (
  <div className="w-5 h-5 shrink-0 rounded-full border-2 border-winelio-gray/30" />
);

export const StepContact = ({ selfProfile, sponsorCode, beneficiaryChoice, onChoose }: StepContactProps) => {
  const selfSelected = beneficiaryChoice === "self";
  const otherSelected = beneficiaryChoice === "other";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-winelio-dark">Votre demande</h2>
        <p className="mt-1 text-sm text-winelio-gray">
          Choisissez pour qui cette recommandation est destinée. Aucune option n&apos;est sélectionnée par défaut.
        </p>
      </div>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onChoose("self")}
          aria-pressed={selfSelected}
          className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors cursor-pointer ${
            selfSelected
              ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
              : "border-winelio-gray/20 bg-white hover:border-winelio-gray/40"
          }`}
        >
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
          {selfSelected ? <SelectedBadge /> : <UnselectedBadge />}
        </button>

        <button
          type="button"
          onClick={() => onChoose("other")}
          aria-pressed={otherSelected}
          className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors cursor-pointer ${
            otherSelected
              ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
              : "border-winelio-gray/20 bg-white hover:border-winelio-gray/40"
          }`}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-winelio-dark">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-winelio-dark">Pour quelqu&apos;un d&apos;autre</p>
            <p className="text-sm text-winelio-gray">Invitez un proche à créer lui-même sa demande</p>
          </div>
          {otherSelected ? <SelectedBadge /> : <UnselectedBadge />}
        </button>

        {otherSelected && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
              <p className="font-semibold">Confidentialité des proches</p>
              <p className="mt-1">
                Winelio ne permet pas de saisir les coordonnées d&apos;une autre personne. Partagez-lui votre invitation : il créera lui-même sa demande et décidera des informations qu&apos;il souhaite transmettre.
              </p>
            </div>
            {sponsorCode ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <CopyButton code={sponsorCode} />
                <ShareButton code={sponsorCode} />
                <EmailInviteButton code={sponsorCode} />
              </div>
            ) : (
              <p className="text-sm text-winelio-gray">Chargement de votre lien d&apos;invitation…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
