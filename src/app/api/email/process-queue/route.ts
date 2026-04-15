// src/app/api/email/process-queue/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";

const BATCH_SIZE = 10;
const RETRY_DELAYS_MIN = [5, 30, 120];

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: batch, error: fetchErr } = await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .select("id, to_email, to_name, subject, html, text_body, from_email, from_name, reply_to, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("[process-queue] fetch error:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!batch || batch.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const ids = batch.map((r) => r.id);

  await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .update({ status: "sending" })
    .in("id", ids);

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    batch.map(async (row) => {
      try {
        await sendMailWithTimeout({
          from:    row.from_name && row.from_email
                     ? `"${row.from_name}" <${row.from_email}>`
                     : SMTP_FROM,
          to:      row.to_name ? `"${row.to_name}" <${row.to_email}>` : row.to_email,
          replyTo: row.reply_to ?? undefined,
          subject: row.subject,
          html:    row.html,
          text:    row.text_body ?? undefined,
        });

        await supabaseAdmin
          .schema("winelio")
          .from("email_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id);

        sent++;
      } catch (err) {
        const attempts = (row.attempts ?? 0) + 1;
        const maxAttempts = 3;
        const delayMin = RETRY_DELAYS_MIN[attempts - 1] ?? 120;
        const nextTry = new Date(Date.now() + delayMin * 60_000).toISOString();

        await supabaseAdmin
          .schema("winelio")
          .from("email_queue")
          .update({
            status:       attempts >= maxAttempts ? "failed" : "pending",
            attempts,
            error:        err instanceof Error ? err.message : String(err),
            scheduled_at: attempts >= maxAttempts ? undefined : nextTry,
          })
          .eq("id", row.id);

        failed++;
        console.error(`[process-queue] échec email ${row.id} (tentative ${attempts}):`, err);
      }
    })
  );

  return NextResponse.json({ processed: batch.length, sent, failed });
}
