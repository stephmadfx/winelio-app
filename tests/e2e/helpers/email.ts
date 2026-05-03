import { wn } from "./supabase";

export type QueuedEmail = {
  id: string;
  to_email: string;
  subject: string;
  html: string;
  status: string;
  created_at: string;
};

/**
 * Lit les emails en queue pour un destinataire E2E.
 * Status `test_skipped` = email enqueued + intercepté par /api/email/process-queue.
 * Status `pending` = pas encore traité par le worker (peut-être que le cron n'a pas tourné).
 */
export async function readQueuedEmails(
  toEmail: string,
  opts: { status?: string; subjectMatch?: RegExp } = {}
): Promise<QueuedEmail[]> {
  let q = wn()
    .from("email_queue")
    .select("id, to_email, subject, html, status, created_at")
    .eq("to_email", toEmail)
    .order("created_at", { ascending: false });

  if (opts.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(`readQueuedEmails: ${error.message}`);

  return (data ?? []).filter((row) =>
    opts.subjectMatch ? opts.subjectMatch.test(row.subject) : true
  );
}

/**
 * Force le passage du worker SMTP pour vider la queue.
 * Utile pour matérialiser le statut `test_skipped` dans les tests.
 */
export async function flushEmailQueue(baseUrl: string, cronSecret: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/email/process-queue`, {
    method: "POST",
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  if (!res.ok) throw new Error(`flushEmailQueue: HTTP ${res.status}`);
}
