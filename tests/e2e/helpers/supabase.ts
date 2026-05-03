import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E } from "./env";

let _client: SupabaseClient | null = null;

/**
 * Client Supabase service-role pour les tests E2E.
 * Bypasse RLS. Pour interroger le schéma winelio : `db().schema('winelio').from('xxx')`.
 * Pour l'auth admin : `db().auth.admin.createUser(...)`.
 * Ne JAMAIS utiliser hors tests.
 */
export function db(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(E2E.supabaseUrl, E2E.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const wn = () => db().schema("winelio");
