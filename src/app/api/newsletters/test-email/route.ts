import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { compileNewsletterMjml } from "@/lib/newsletter-mjml";
import { sendTrackedNewsletterTest, type TestDelivery } from "@/lib/newsletter-test-tracking";
import { applyNewsletterVariables, fetchNewsletterVariablesForEmail } from "@/lib/newsletter-variables";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const user = await assertNewsletterAdmin();
    const body = await req.json();
    const inputRecipients: string[] = Array.isArray(body.to)
      ? body.to.map((email: unknown) => typeof email === "string" ? email.trim() : "").filter(Boolean)
      : [typeof body.to === "string" ? body.to.trim() : ""].filter(Boolean);
    const recipients = [...new Set(inputRecipients.map(email => email.toLowerCase()))];
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const preheader = typeof body.preheader === "string" ? body.preheader.trim() : "";
    const mjmlContent = typeof body.mjmlContent === "string" ? body.mjmlContent : "";

    if (recipients.length === 0 || recipients.some((email) => !EMAIL_RE.test(email))) {
      return NextResponse.json({ error: "Email de test invalide" }, { status: 400 });
    }

    if (recipients.length > 20) return NextResponse.json({ error: "Limitez le test à 20 destinataires" }, { status: 400 });
    const deliveries: TestDelivery[] = [];
    for (const to of recipients) {
      const variables = await fetchNewsletterVariablesForEmail(to);
      const compiled = await compileNewsletterMjml(applyNewsletterVariables(mjmlContent, variables));
      deliveries.push({
        to,
        subject: applyNewsletterVariables(subject, variables),
        preheader: applyNewsletterVariables(preheader, variables),
        html: compiled.html,
      });
    }

    const result = await sendTrackedNewsletterTest({ deliveries, userId: user.id, templateId: typeof body.id === "string" ? body.id : undefined });
    return NextResponse.json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible";
    console.error("[newsletters/test-email] Envoi ou suivi du test impossible");
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
