import { transporter, SMTP_FROM } from "@/lib/email-transporter";

type SendNewsletterEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  test?: boolean;
  headers?: Record<string, string>;
  campaignId?: string;
};

/** Envoi newsletter via le SMTP Amazon SES (même transport que les mails transactionnels). */
export const sendNewsletterEmail = async ({
  to, subject, html, text, test = false, headers, campaignId,
}: SendNewsletterEmailParams) => {
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: test ? `[TEST] ${subject || "Newsletter Winelio"}` : subject,
    html,
    text,
    headers: {
      ...headers,
      ...(campaignId ? { "X-SES-MESSAGE-TAGS": `campaign_id=${campaignId}` } : {}),
    },
  });
  // SES répond « 250 Ok <message-id SES> » : c'est cet id qui sert aux rebonds/plaintes.
  const sesId = info.response?.match(/^250 Ok (\S+)/)?.[1];
  return { provider: "ses" as const, messageId: sesId ?? info.messageId };
};

export const sendNewsletterTestEmail = async ({ to, subject, html, preheader }: {
  to: string;
  subject: string;
  html: string;
  preheader?: string;
}) => sendNewsletterEmail({
  to,
  subject,
  html,
  text: preheader || "Aperçu de newsletter Winelio.",
  test: true,
});
