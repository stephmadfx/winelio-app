import { NextResponse } from "next/server";
import {
  assertSuperAdmin,
  buildNewsletterHtml,
  normalizeNewsletterPayload,
  resolveNewsletterRecipients,
  validateNewsletterPayload,
} from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const { data, error } = await supabaseAdmin.from("newsletters").select("*").eq("id", id).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ newsletter: data });
}

export async function PUT(request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const { data: existing } = await supabaseAdmin.from("newsletters").select("status").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Newsletter introuvable" }, { status: 404 });
  if (existing.status === "sent" || existing.status === "sending") {
    return NextResponse.json({ error: "Impossible de modifier une newsletter déjà envoyée" }, { status: 400 });
  }

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
    .update({
      subject: payload.subject,
      content: payload.content,
      html_content: buildNewsletterHtml({ subject: payload.subject, content: payload.content }),
      recipient_filters: payload.recipientFilters,
      selected_recipient_ids: payload.selectedRecipientIds,
      excluded_recipient_ids: payload.excludedRecipientIds,
      manual_emails: payload.manualEmails,
      recipient_count: recipients.length,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ newsletter: data });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const { data: existing } = await supabaseAdmin.from("newsletters").select("status").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Newsletter introuvable" }, { status: 404 });
  if (existing.status === "sent" || existing.status === "sending") {
    return NextResponse.json({ error: "Impossible de supprimer une newsletter envoyée" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("newsletters").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
