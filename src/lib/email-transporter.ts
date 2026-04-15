// src/lib/email-transporter.ts
import nodemailer from "nodemailer";

const smtpPort = Number(process.env.SMTP_PORT) || 465;

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "ssl0.ovh.net",
  port: smtpPort,
  secure: smtpPort === 465,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 8000,
  auth: {
    user: process.env.SMTP_USER || "support@winelio.app",
    pass: process.env.SMTP_PASS || "",
  },
});

export const SMTP_FROM = `"${process.env.SMTP_SENDER_NAME || "Winelio"}" <${process.env.SMTP_USER || "support@winelio.app"}>`;

export const SEND_TIMEOUT_MS = 10_000;

export async function sendMailWithTimeout(
  message: Parameters<typeof transporter.sendMail>[0]
): Promise<void> {
  await Promise.race([
    transporter.sendMail(message),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SMTP timeout")), SEND_TIMEOUT_MS)
    ),
  ]);
}
