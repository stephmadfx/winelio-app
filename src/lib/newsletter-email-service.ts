import { SMTP_FROM } from "@/lib/email-transporter";

type SendNewsletterEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  test?: boolean;
  headers?: Record<string, string>;
  campaignId?: string;
};

type ResendResponse = { id?: string; message?: string; name?: string };

export const sendNewsletterEmail = async ({
  to, subject, html, text, test = false, headers, campaignId,
}: SendNewsletterEmailParams) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Resend n'est pas configuré pour Winelio");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM?.trim() || SMTP_FROM,
        to: [to],
        subject: test ? `[TEST] ${subject || "Newsletter Winelio"}` : subject,
        html,
        text,
        headers,
        tags: campaignId ? [{ name: "campaign_id", value: campaignId }] : undefined,
      }),
    });
    const payload = await res.json().catch(() => ({})) as ResendResponse;
    if (!res.ok || !payload.id) {
      throw new Error(`Resend ${res.status} : ${payload.message || payload.name || "envoi refusé"}`);
    }
    return { provider: "resend" as const, messageId: payload.id };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Resend n'a pas répondu dans le délai prévu");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
