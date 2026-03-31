// src/lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
