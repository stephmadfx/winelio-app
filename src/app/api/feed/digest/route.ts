import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { data, error } = await client.rpc("get_network_digest");
  if (error) return NextResponse.json({ error: "Résumé indisponible." }, { status: 503 });
  return NextResponse.json({ digest: data?.[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function DELETE(req: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return NextResponse.json({ error: "Résumé invalide." }, { status: 400 });
  const { error } = await client.rpc("dismiss_network_digest", { p_id: body.id });
  if (error) return NextResponse.json({ error: "Impossible de fermer le résumé. Réessayez." }, { status: 503 });
  return NextResponse.json({ dismissed: true });
}
