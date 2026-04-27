import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "winelio" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    cookieOptions: {
      name: "sb-winelio-auth-token",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    },
  });
}
