import { NextResponse } from "next/server";
import { recordNewsletterEvent } from "@/lib/newsletter";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  const { data: recipient } = await supabaseAdmin
    .from("newsletter_recipients")
    .select("id, email")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (recipient) {
    await recordNewsletterEvent({ recipientId: recipient.id, eventType: "unsubscribed", request });
  }

  return new NextResponse(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Désinscription Winelio</title></head>
<body style="margin:0;background:#F0F2F4;font-family:Arial,sans-serif;color:#2D3436;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:16px;">
<tr><td style="padding:36px;text-align:center;">
<h1 style="margin:0 0 12px;font-size:22px;">Désinscription confirmée</h1>
<p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Vous ne recevrez plus cette newsletter Winelio.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
