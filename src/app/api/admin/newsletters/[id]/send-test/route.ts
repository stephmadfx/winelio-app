import { NextResponse } from "next/server";
import { assertSuperAdmin, buildNewsletterHtml } from "@/lib/newsletter";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const { email } = await request.json();
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email de test invalide" }, { status: 400 });
  }

  const { id } = await context.params;
  const { data: newsletter, error } = await supabaseAdmin
    .from("newsletters")
    .select("subject, content")
    .eq("id", id)
    .single();

  if (error || !newsletter) return NextResponse.json({ error: "Newsletter introuvable" }, { status: 404 });

  await sendMailWithTimeout({
    from: SMTP_FROM,
    to: email,
    subject: `[Test] ${newsletter.subject}`,
    text: newsletter.content,
    html: buildNewsletterHtml({ subject: newsletter.subject, content: newsletter.content }),
  });

  return NextResponse.json({ success: true });
}
