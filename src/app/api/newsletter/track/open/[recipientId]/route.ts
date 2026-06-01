import { NextResponse } from "next/server";
import { recordNewsletterEvent } from "@/lib/newsletter";

type Context = { params: Promise<{ recipientId: string }> };

const PIXEL = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export async function GET(request: Request, context: Context) {
  const { recipientId } = await context.params;
  await recordNewsletterEvent({ recipientId, eventType: "opened", request });

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
