/**
 * Dispatcher d'emails unifié pour Winelio : tout part par SMTP (Amazon SES, eu-west-3).
 * Toutes les routes (OTP, queue worker, notifications) doivent appeler
 * `sendEmail(...)` pour bénéficier du logging dans `winelio.email_sent_log`.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEmailDisabledReason } from "@/lib/email-environment";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";

export interface EmailAttachment {
  filename: string;
  /** Buffer brut (PDF généré, etc.) */
  content: Buffer;
  contentType?: string;
}

export interface SendEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  provider: "smtp";
  providerId?: string;
  ok: boolean;
  error?: string;
}

async function logEmail(
  provider: "smtp",
  to: string,
  subject: string,
  success: boolean,
  providerId?: string,
  error?: string,
): Promise<void> {
  try {
    await supabaseAdmin.schema("winelio").from("email_sent_log").insert({
      provider,
      to_email: to,
      subject,
      success,
      provider_id: providerId ?? null,
      error: error ?? null,
    });
  } catch (e) {
    // Pas de boucle infinie : si le log foire on ne re-essaye pas
    console.error("[email-sender] log insert failed:", e);
  }
}

async function trySendSmtp(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    await sendMailWithTimeout({
      from: SMTP_FROM,
      to: params.toName ? `"${params.toName}" <${params.to}>` : params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { provider: "smtp", ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { provider: "smtp", ok: false, error: msg };
  }
}

/** Envoie un email par SMTP (SES). Toujours log dans email_sent_log (succès ou échec). */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const disabledReason = getEmailDisabledReason();
  if (disabledReason) {
    console.warn(`[email-sender] Email non envoyé: ${disabledReason}`);
    return { provider: "smtp", ok: false, error: disabledReason };
  }

  // Rebond permanent signalé par SES (/api/ses/notifications) : on n'insiste pas, ça nuit à la réputation d'envoi.
  const { data: bounced } = await supabaseAdmin
    .schema("winelio")
    .from("newsletter_suppressions")
    .select("email")
    .eq("email", params.to.trim().toLowerCase())
    .eq("reason", "bounce")
    .maybeSingle();
  if (bounced) {
    const error = "adresse en rebond permanent (SES)";
    await logEmail("smtp", params.to, params.subject, false, undefined, error);
    return { provider: "smtp", ok: false, error };
  }

  const result = await trySendSmtp(params);
  await logEmail(result.provider, params.to, params.subject, result.ok, result.providerId, result.error);
  return result;
}
