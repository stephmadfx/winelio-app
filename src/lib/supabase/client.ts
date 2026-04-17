import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "winelio" },
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "sb-winelio-auth-token",
    },
    cookieOptions: {
      name: "sb-winelio-auth-token",
      lifetime: 60 * 60 * 24 * 365,
      sameSite: "lax",
    },
  });
}
