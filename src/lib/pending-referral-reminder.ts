export const buildPendingReminderMessage = (firstName: string) =>
  `Bonjour ${firstName || ""}, je vous ai préinscrit(e) sur Winelio. Pensez à ouvrir l’e-mail de validation reçu afin de confirmer votre compte et de créer votre mot de passe.`;

export const buildPendingReminderSubject = () =>
  "Rappel : finalisez votre inscription Winelio";

export const buildSmsUri = (phone: string, message: string, isIOS: boolean) => {
  const normalizedPhone = phone.replace(/[^+\d]/g, "");
  const separator = isIOS ? "&" : "?";
  return `sms:${normalizedPhone}${separator}body=${encodeURIComponent(message)}`;
};

export const buildMailtoUri = (email: string, subject: string, message: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
