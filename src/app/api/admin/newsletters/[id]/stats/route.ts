import { NextResponse } from "next/server";
import { assertSuperAdmin } from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const search = (params.get("search") || "").trim().slice(0, 200);
  const filter = params.get("filter");
  const pageSize = 50;
  const { data: newsletter, error } = await supabaseAdmin.from("newsletters")
    .select("id, subject, is_test, status, recipient_count, sent_count, failed_count, opened_count, clicked_count, sent_at, created_at")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!newsletter) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });

  let query = supabaseAdmin.from("newsletter_recipients")
    .select("id, email, recipient_type, sent_at, opened_at, clicked_at, failed_at, failure_reason, unsubscribed_at", { count: "exact" })
    .eq("newsletter_id", id);
  if (search) query = query.ilike("email", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  const filterColumns = { opened: "opened_at", clicked: "clicked_at", failed: "failed_at", unsubscribed: "unsubscribed_at" } as const;
  if (filter && Object.hasOwn(filterColumns, filter)) query = query.not(filterColumns[filter as keyof typeof filterColumns], "is", null);

  const [recipients, events, unsubscribed] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize - 1),
    supabaseAdmin.from("newsletter_events").select("event_type, url, created_at")
      .eq("newsletter_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100),
    supabaseAdmin.from("newsletter_recipients").select("id", { count: "exact", head: true })
      .eq("newsletter_id", id).not("unsubscribed_at", "is", null),
  ]);
  if (recipients.error || events.error || unsubscribed.error) {
    return NextResponse.json({ error: "Impossible de charger les statistiques. Réessayez." }, { status: 500 });
  }
  return NextResponse.json({ newsletter, recipients: recipients.data ?? [], events: events.data ?? [],
    unsubscribedCount: unsubscribed.count ?? 0, total: recipients.count ?? 0, page, pageSize });
}
