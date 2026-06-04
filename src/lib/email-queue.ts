// src/lib/email-queue.ts
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface QueueEmailParams {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** 1 = urgent, 5 = normal (défaut), 10 = bulk */
  priority?: number;
  /** Délai avant envoi */
  scheduledAt?: Date;
  /** Cle metier stable pour eviter les doublons lors des retries. */
  dedupeKey?: string;
  /** Remonte l'erreur aux appels critiques au lieu de seulement logger. */
  throwOnError?: boolean;
}

/**
 * Enfile un email dans winelio.email_queue.
 * L'envoi effectif est délégué au cron process-email-queue (max 600/h).
 * Ne pas utiliser pour les OTP (temps-réel) ni les emails avec pièce jointe PDF.
 *
 * @returns id de la ligne email_queue creee, ou null si echec d'insertion/doublon
 */
export async function queueEmail(params: QueueEmailParams): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .insert({
      to_email:     params.to,
      to_name:      params.toName ?? null,
      subject:      params.subject,
      html:         params.html,
      text_body:    params.text ?? null,
      reply_to:     params.replyTo ?? null,
      priority:     params.priority ?? 5,
      scheduled_at: params.scheduledAt?.toISOString() ?? new Date().toISOString(),
      dedupe_key:   params.dedupeKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (params.dedupeKey && error.code === "23505") {
      return null;
    }

    console.error("[email-queue] Erreur insertion:", error.message);
    if (params.throwOnError) {
      throw error;
    }

    return null;
  }

  return data?.id ?? null;
}
