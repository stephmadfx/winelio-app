import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.latitude !== "number" || typeof body?.longitude !== "number" || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Math.abs(body.latitude) > 90 || Math.abs(body.longitude) > 180) return NextResponse.json({ error: "Localisation invalide." }, { status: 400 });
  const { data, error } = await db.rpc("search_professionals_by_distance", {
    p_latitude: body.latitude, p_longitude: body.longitude,
    p_category_name: typeof body.category === "string" ? body.category.slice(0,150) : "all",
    p_commune: typeof body.commune === "string" ? body.commune.slice(0,150) : null,
    p_search: typeof body.search === "string" && body.search.trim().length >= 2 ? body.search.trim().slice(0,150) : null,
    p_limit: 250,
  });
  if (error) return NextResponse.json({ error: "La recherche de professionnels est momentanément indisponible." }, { status: 500 });
  const ids = (data ?? []).map((row: { profile_id: string }) => row.profile_id);
  const { data: summaries, error: ratingError } = ids.length ? await db.from("professional_review_summaries").select("professional_id,avg_rating,review_count").in("professional_id", ids) : { data: [], error: null };
  if (ratingError) return NextResponse.json({ error: "Les notes sont momentanément indisponibles. Réessayez." }, { status: 500 });
  const byId = new Map((summaries ?? []).map(row => [row.professional_id, row]));
  return NextResponse.json({ professionals: (data ?? []).filter((row: { profile_id: string }) => row.profile_id !== user.id).map((row: { profile_id: string }) => ({ ...row, avg_rating: byId.get(row.profile_id)?.avg_rating ?? null, review_count: byId.get(row.profile_id)?.review_count ?? 0 })) }, { headers: { "Cache-Control": "no-store" } });
}
