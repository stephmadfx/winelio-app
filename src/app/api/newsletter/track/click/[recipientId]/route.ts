import { NextResponse } from "next/server";
import { recordNewsletterEvent } from "@/lib/newsletter";

type Context = { params: Promise<{ recipientId: string }> };

export async function GET(request: Request, context: Context) {
  const { recipientId } = await context.params;
  const rawTarget = new URL(request.url).searchParams.get("u");
  let target: URL;
  try {
    // Older campaigns encoded the HTML entity in Google Play query strings.
    target = new URL((rawTarget || "").replace(/&amp;/g, "&"));
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("Invalid target");
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  try {
    await recordNewsletterEvent({ recipientId, eventType: "clicked", request, url: target.toString() });
  } catch {
    // A telemetry outage must never prevent opening a download link.
    console.error("[newsletter/click] Échec de l’enregistrement du clic");
  }
  return NextResponse.redirect(target);
}
