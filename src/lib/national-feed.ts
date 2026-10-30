import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedEvent } from "@/lib/feed-utils";

// RPC is the only public projection: no source dossier, customer, city or full name.
export async function getNationalFeed(client: SupabaseClient): Promise<FeedEvent[]> {
  const { data, error } = await client.rpc("get_national_feed", { p_limit: 100 });
  if (error) throw new Error("Le fil national est momentanément indisponible.");
  return (data ?? []).map((row: { id: string; kind: "member_joined" | "member_sponsored" | "recommendation_created" | "gain_credited"; display_name: string; amount: number | null; occurred_at: string }) => ({
    id: row.id, kind: row.kind, user: row.display_name,
    ...(row.kind === "gain_credited" ? { amount: Number(row.amount) } : {}),
    timestamp: row.occurred_at,
  })) as FeedEvent[];
}
