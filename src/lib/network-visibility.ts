import type { SupabaseClient } from "@supabase/supabase-js";

export type NetworkScope = { demoOwnerId: string | null };

// A demo viewer keeps its own sandbox. Real viewers never include demo branches.
export async function getNetworkScope(client: SupabaseClient, userId: string, forceReal = false): Promise<NetworkScope> {
  if (forceReal) return { demoOwnerId: null };
  const { data, error } = await client.from("profiles").select("is_demo, demo_owner_id").eq("id", userId).maybeSingle();
  if (error || !data) throw new Error("Réseau momentanément indisponible.");
  return { demoOwnerId: data.is_demo ? data.demo_owner_id ?? userId : null };
}

// Keep the original query result type without recursively expanding Supabase generics.
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  not(column: string, operator: string, value: unknown): FilterQuery;
};
export function scopeNetworkProfiles<T>(query: T, scope: NetworkScope): T {
  const filters = query as unknown as FilterQuery;
  return (scope.demoOwnerId
    ? filters.eq("is_demo", true).eq("demo_owner_id", scope.demoOwnerId)
    : filters.not("is_demo", "is", true)) as unknown as T;
}

export function scopeNetworkData<T>(query: T, scope: NetworkScope): T {
  const filters = query as unknown as FilterQuery;
  return (scope.demoOwnerId ? filters.eq("is_demo", true) : filters.not("is_demo", "is", true)) as unknown as T;
}
