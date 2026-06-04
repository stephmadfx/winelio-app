import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";

type SendTestEmailParams = {
  to: string;
  subject: string;
  html: string;
  preheader?: string;
};

const RESEND_TIMEOUT_MS = 10_000;

const sendWithResend = async ({
  to,
  subject,
  html,
  preheader,
}: SendTestEmailParams) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend non configuré");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || SMTP_FROM,
        to,
        subject: `[TEST] ${subject || "Newsletter Winelio"}`,
        html,
        text: preheader || "Aperçu de newsletter Winelio.",
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Resend ${res.status}: ${errorBody}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

const sendWithSmtp = async ({
  to,
  subject,
  html,
  preheader,
}: SendTestEmailParams) => {
  await sendMailWithTimeout({
    from: SMTP_FROM,
    to,
    subject: `[TEST] ${subject || "Newsletter Winelio"}`,
    text: preheader || "Aperçu de newsletter Winelio.",
    html,
  });
};

export const sendNewsletterTestEmail = async ({
  to,
  subject,
  html,
  preheader,
}: SendTestEmailParams) => {
  try {
    await sendWithResend({
      to,
      subject,
      html,
      preheader,
    });
    return;
  } catch (err) {
    console.warn(
      "[newsletter-email] Resend indisponible, fallback SMTP:",
      err instanceof Error ? err.message : String(err)
    );
  }

  await sendWithSmtp({
    to,
    subject,
    html,
    preheader,
  });
};
