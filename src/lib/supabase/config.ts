export const SUPABASE_URL =
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\s/g, "");

export const SUPABASE_ANON_KEY =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/\s/g, "");
