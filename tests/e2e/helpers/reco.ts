export function recoCreateBody(proId: string, contactId: string, description: string) {
  return {
    selectedProId: proId,
    selectedContactId: contactId,
    description,
    urgency: "normal" as const,
    thirdPartyConsent: true,
    createContact: false,
  };
}
