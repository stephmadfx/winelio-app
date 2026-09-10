import { NextResponse } from "next/server";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { sendNewsletterTemplateCampaign } from "@/lib/newsletter-campaign";
import type { NewsletterAudienceFilters } from "@/lib/newsletter-audience";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await assertNewsletterAdmin();
    const { id } = await params;
    const body = await req.json();
    const expectedCount = Number(body.expectedCount);
    if (!Number.isInteger(expectedCount) || expectedCount < 1) {
      return NextResponse.json({ error: "Nombre de destinataires invalide" }, { status: 400 });
    }
    const result = await sendNewsletterTemplateCampaign({
      templateId: id,
      filters: (body.filters ?? {}) as NewsletterAudienceFilters,
      expectedCount,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
