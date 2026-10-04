import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { buildNewsletterHtml } from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTrackedNewsletterTest } from "@/lib/newsletter-test-tracking";
import { applyNewsletterVariables, fetchNewsletterVariablesForEmail } from "@/lib/newsletter-variables";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const user = await assertNewsletterAdmin();
    const { email } = await request.json();
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return NextResponse.json({ error: "Email de test invalide" }, { status: 400 });
    const { id } = await context.params;
    const { data: newsletter, error } = await supabaseAdmin.from("newsletters").select("subject, content, html_content").eq("id", id).single();
    if (error || !newsletter) return NextResponse.json({ error: "Newsletter introuvable" }, { status: 404 });
    const variables = await fetchNewsletterVariablesForEmail(email.trim());
    const html = applyNewsletterVariables(newsletter.html_content || buildNewsletterHtml({ subject: newsletter.subject, content: newsletter.content }), variables);
    return NextResponse.json(await sendTrackedNewsletterTest({ userId: user.id, deliveries: [{ to: email.trim(), subject: newsletter.subject.replace(/^\[TEST\]\s*/i, ""), preheader: newsletter.content, html }] }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi impossible";
    return NextResponse.json({ error: message }, { status: message === "Non authentifié" ? 401 : message === "Accès refusé" ? 403 : 500 });
  }
}
