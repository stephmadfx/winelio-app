import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const { data: newsletter, error } = await supabaseAdmin
    .from("newsletters")
    .select("id, subject, status, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at")
    .eq("id", id)
    .single();

  if (error || !newsletter) return NextResponse.json({ error: "Newsletter introuvable" }, { status: 404 });

  const { data: recipients } = await supabaseAdmin
    .from("newsletter_recipients")
    .select("id, email, recipient_type, sent_at, opened_at, clicked_at, failed_at, failure_reason, unsubscribed_at")
    .eq("newsletter_id", id)
    .order("created_at", { ascending: false });

  const { data: events } = await supabaseAdmin
    .from("newsletter_events")
    .select("event_type, url, created_at")
    .eq("newsletter_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ newsletter, recipients: recipients ?? [], events: events ?? [] });
}
