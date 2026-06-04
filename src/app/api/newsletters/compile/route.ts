import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { compileNewsletterMjml } from "@/lib/newsletter-mjml";

export async function POST(req: Request) {
  try {
    await assertNewsletterAdmin();
    const body = await req.json();
    const mjml = typeof body.mjmlContent === "string" ? body.mjmlContent : "";
    const compiled = await compileNewsletterMjml(mjml);

    return NextResponse.json({
      html: compiled.html,
      mjml: compiled.mjml,
      warnings: compiled.errors.map((err) => err.formattedMessage || err.message),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation impossible";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
