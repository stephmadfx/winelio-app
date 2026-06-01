import { NextResponse } from "next/server";
import { recordNewsletterEvent } from "@/lib/newsletter";

type Context = { params: Promise<{ recipientId: string }> };

export async function GET(request: Request, context: Context) {
  const { recipientId } = await context.params;
  const target = new URL(request.url).searchParams.get("u");

  if (!target || !/^https?:\/\//.test(target)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  await recordNewsletterEvent({ recipientId, eventType: "clicked", request, url: target });
  return NextResponse.redirect(target);
}
