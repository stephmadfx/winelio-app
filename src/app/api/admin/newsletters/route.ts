import { NextResponse } from "next/server";
import {
  assertSuperAdmin,
  buildNewsletterHtml,
  normalizeNewsletterPayload,
  resolveNewsletterRecipients,
  validateNewsletterPayload,
} from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("newsletters")
    .select("id, subject, status, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at, scheduled_for, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ newsletters: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const payload = normalizeNewsletterPayload(await request.json());
  const validationError = validateNewsletterPayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const recipients = await resolveNewsletterRecipients(
    payload.recipientFilters,
    payload.selectedRecipientIds,
    payload.excludedRecipientIds,
    payload.manualEmails
  );

  const { data, error } = await supabaseAdmin
    .from("newsletters")
    .insert({
      subject: payload.subject,
      content: payload.content,
      html_content: buildNewsletterHtml({ subject: payload.subject, content: payload.content }),
      recipient_filters: payload.recipientFilters,
      selected_recipient_ids: payload.selectedRecipientIds,
      excluded_recipient_ids: payload.excludedRecipientIds,
      manual_emails: payload.manualEmails,
      recipient_count: recipients.length,
      created_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ newsletter: data });
}
