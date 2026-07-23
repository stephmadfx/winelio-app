export const PENDING_REFERRAL_STATUS = "pending_confirmation";

export const PENDING_REFERRAL_HELP =
  "Préinscription envoyée : le filleul doit confirmer son e-mail, accepter les conditions et créer son mot de passe.";

export function isPendingReferral(status: string | null | undefined) {
  return status === PENDING_REFERRAL_STATUS;
}
