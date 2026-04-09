// Côté serveur (Docker) : réseau interne. Côté navigateur : sous-domaine public.
// "build-placeholder" évite que createClient() plante au moment du build si les vars sont absentes.
export const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://build-placeholder.supabase.co"
).replace(/\s/g, "");

export const SUPABASE_ANON_KEY =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "build-placeholder-anon-key").replace(/\s/g, "");
