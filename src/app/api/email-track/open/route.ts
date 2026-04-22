import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Pixel GIF 1×1 transparent
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rid = searchParams.get("rid");

  const respond = () =>
    new NextResponse(PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Content-Length": String(PIXEL.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
      },
    });

  if (!rid) return respond();

  // Premier open uniquement — ignore silencieusement les erreurs pour ne jamais casser le pixel
  try {
    await supabaseAdmin
      .schema("winelio")
      .from("recommendations")
      .update({ email_opened_at: new Date().toISOString() })
      .eq("id", rid)
      .is("email_opened_at", null);
  } catch (e) {
    console.error("[email-track/open] update error:", e);
  }

  return respond();
}
