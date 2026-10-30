import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNationalFeed } from "@/lib/national-feed";
export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  try {
    return NextResponse.json({ events: await getNationalFeed(client) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Actualités indisponibles. Réessayez." }, { status: 503 });
  }
}
