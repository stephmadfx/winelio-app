import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { compileNewsletterMjml } from "@/lib/newsletter-mjml";
import { sendNewsletterTestEmail } from "@/lib/newsletter-email-service";
import { applyNewsletterVariables, fetchNewsletterVariablesForEmail } from "@/lib/newsletter-variables";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const user = await assertNewsletterAdmin();
    const body = await req.json();
    const recipients: string[] = Array.isArray(body.to)
      ? body.to.map((email: unknown) => typeof email === "string" ? email.trim() : "").filter(Boolean)
      : [typeof body.to === "string" ? body.to.trim() : ""].filter(Boolean);
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const preheader = typeof body.preheader === "string" ? body.preheader.trim() : "";
    const mjmlContent = typeof body.mjmlContent === "string" ? body.mjmlContent : "";

    if (recipients.length === 0 || recipients.some((email) => !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: "Email de test invalide" }, { status: 400 });
    }

    for (const to of recipients) {
      const variables = await fetchNewsletterVariablesForEmail(to);
      const compiled = await compileNewsletterMjml(applyNewsletterVariables(mjmlContent, variables));
      await sendNewsletterTestEmail({
        to,
        subject: applyNewsletterVariables(subject, variables),
        preheader: applyNewsletterVariables(preheader, variables),
        html: compiled.html,
      });
    }

    if (typeof body.id === "string") {
      await supabaseAdmin
        .schema("winelio")
        .from("newsletter_templates")
        .update({ test_sent_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ success: true, sent: recipients.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible";
    console.error("[newsletters/test-email]", err);
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
