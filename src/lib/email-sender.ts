/**
 * Dispatcher d'emails unifié pour Winelio.
 *
 *   - Provider primaire : **Resend** (gratuit jusqu'à 100/jour, 3000/mois)
 *   - Fallback automatique : **SMTP o2switch** dès que le quota Resend est dépassé
 *
 * Toutes les routes (OTP, queue worker, notifications) doivent appeler
 * `sendEmail(...)` au lieu de Nodemailer directement, pour bénéficier du
 * choix automatique du provider + logging dans `winelio.email_sent_log`.
 *
 * Le quota Resend est mesuré en interrogeant la table d'audit `email_sent_log`
 * (count distinct des emails envoyés avec succès via Resend aujourd'hui / ce mois-ci).
 *
 * Si Resend est indisponible / lève une erreur réseau, on bascule automatiquement
 * sur SMTP pour cet envoi (avec log de la cause).
 */

import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";

const RESEND_DAILY_LIMIT = 99;   // 100 - 1 pour garder une marge de sécurité
const RESEND_MONTHLY_LIMIT = 2999;

const RESEND_FROM = process.env.RESEND_FROM || "Winelio <noreply@winelio.app>";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

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
  /** Force l'utilisation d'un provider (debug, ou besoin spécifique). */
  forceProvider?: "resend" | "smtp";
}

export interface SendEmailResult {
  provider: "resend" | "smtp";
  providerId?: string;
  ok: boolean;
  error?: string;
}

async function logEmail(
  provider: "resend" | "smtp",
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

interface QuotaUsage {
  today: number;
  thisMonth: number;
}

async function getResendUsage(): Promise<QuotaUsage> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const { count: todayCount } = await supabaseAdmin
    .schema("winelio")
    .from("email_sent_log")
    .select("id", { count: "exact", head: true })
    .eq("provider", "resend")
    .eq("success", true)
    .gte("sent_at", startOfDay.toISOString());

  const { count: monthCount } = await supabaseAdmin
    .schema("winelio")
    .from("email_sent_log")
    .select("id", { count: "exact", head: true })
    .eq("provider", "resend")
    .eq("success", true)
    .gte("sent_at", startOfMonth.toISOString());

  return {
    today: todayCount ?? 0,
    thisMonth: monthCount ?? 0,
  };
}

export async function getEmailUsageStats(): Promise<{
  resend: QuotaUsage;
  limits: { daily: number; monthly: number };
  resendAvailable: boolean;
}> {
  if (!resendClient) {
    return {
      resend: { today: 0, thisMonth: 0 },
      limits: { daily: RESEND_DAILY_LIMIT, monthly: RESEND_MONTHLY_LIMIT },
      resendAvailable: false,
    };
  }
  const usage = await getResendUsage();
  return {
    resend: usage,
    limits: { daily: RESEND_DAILY_LIMIT, monthly: RESEND_MONTHLY_LIMIT },
    resendAvailable: usage.today < RESEND_DAILY_LIMIT && usage.thisMonth < RESEND_MONTHLY_LIMIT,
  };
}

async function trySendResend(params: SendEmailParams): Promise<SendEmailResult> {
  if (!resendClient) {
    return { provider: "resend", ok: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await resendClient.emails.send({
      from: RESEND_FROM,
      to: params.toName ? `${params.toName} <${params.to}>` : params.to,
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
    if (res.error) {
      return {
        provider: "resend",
        ok: false,
        error: `${res.error.name ?? "ResendError"}: ${res.error.message ?? "unknown"}`,
      };
    }
    return { provider: "resend", ok: true, providerId: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { provider: "resend", ok: false, error: msg };
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

/**
 * Envoie un email via Resend (si quota OK + clé configurée) ou via SMTP sinon.
 * Toujours log dans email_sent_log (succès ou échec).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // 1. Choix du provider
  let useResend = false;
  if (params.forceProvider === "resend") {
    useResend = !!resendClient;
  } else if (params.forceProvider === "smtp") {
    useResend = false;
  } else if (resendClient) {
    try {
      const usage = await getResendUsage();
      useResend =
        usage.today < RESEND_DAILY_LIMIT && usage.thisMonth < RESEND_MONTHLY_LIMIT;
      if (!useResend) {
        console.warn(
          `[email-sender] Quota Resend atteint (today=${usage.today}/${RESEND_DAILY_LIMIT}, month=${usage.thisMonth}/${RESEND_MONTHLY_LIMIT}). Fallback SMTP.`,
        );
      }
    } catch (e) {
      console.error("[email-sender] erreur lecture quota, fallback SMTP :", e);
      useResend = false;
    }
  }

  // 2. Tentative provider primaire
  let result = useResend ? await trySendResend(params) : await trySendSmtp(params);

  // 3. Si Resend échoue (erreur réseau, API down), fallback automatique sur SMTP
  if (useResend && !result.ok) {
    console.warn(`[email-sender] Resend a échoué (${result.error}), fallback SMTP`);
    await logEmail("resend", params.to, params.subject, false, undefined, result.error);
    result = await trySendSmtp(params);
  }

  // 4. Log final
  await logEmail(
    result.provider,
    params.to,
    params.subject,
    result.ok,
    result.providerId,
    result.error,
  );

  return result;
}
