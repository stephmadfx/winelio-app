import { NextResponse } from "next/server";
import { assertSuperAdmin, normalizeNewsletterPayload, resolveNewsletterRecipients, invalidEmails } from "@/lib/newsletter";

export async function POST(request: Request) {
  const auth = await assertSuperAdmin();
  if (auth.response) return auth.response;

  const payload = normalizeNewsletterPayload(await request.json());
  const invalid = invalidEmails(payload.manualEmails);
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Emails invalides : ${invalid.slice(0, 5).join(", ")}` }, { status: 400 });
  }

  const recipients = await resolveNewsletterRecipients(
    payload.recipientFilters,
    payload.selectedRecipientIds,
    payload.excludedRecipientIds,
    payload.manualEmails
  );

  return NextResponse.json({ count: recipients.length });
}
