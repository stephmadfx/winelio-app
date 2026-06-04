import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { previewNewsletterAudience, type NewsletterAudienceFilters } from "@/lib/newsletter-audience";

export async function POST(req: Request) {
  try {
    await assertNewsletterAdmin();
    const body = await req.json();
    const filters = body && typeof body === "object"
      ? (body.filters ?? body) as NewsletterAudienceFilters
      : {};

    const audience = await previewNewsletterAudience(filters);
    return NextResponse.json(audience);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aperçu destinataires impossible";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
