import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const defaults = { share_activity: false, share_gains: false, daily_digest_frequency: 0 };
export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { data, error } = await client.from("feed_preferences")
    .select("share_activity, share_gains, daily_digest_frequency").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Préférences indisponibles." }, { status: 503 });
  return NextResponse.json(data ?? defaults, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(req: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.share_activity !== "boolean" || typeof body.share_gains !== "boolean" ||
      ![0, 1, 2].includes(body.daily_digest_frequency) || (body.share_gains && !body.share_activity)) {
    return NextResponse.json({ error: "Préférences invalides." }, { status: 400 });
  }
  const { error } = await client.rpc("set_feed_preferences", {
    p_share_activity: body.share_activity, p_share_gains: body.share_gains,
    p_frequency: body.daily_digest_frequency,
  });
  if (error) return NextResponse.json({ error: "Enregistrement impossible. Réessayez." }, { status: 503 });
  return NextResponse.json({ saved: true });
}
