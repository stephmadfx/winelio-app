import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
    },
    cookieOptions: {
      lifetime: 60 * 60 * 24 * 365, // 1 an — évite la déconnexion à la fermeture du navigateur
      sameSite: "lax",
    },
  });
}
