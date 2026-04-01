import { SupabaseClient } from "@supabase/supabase-js";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Génère un alias unique de format #XXXXXX (6 chars alphanumériques uppercase).
 * Vérifie l'unicité en base avant de retourner. Lance une erreur après 10 tentatives.
 */
export async function generateUniqueAlias(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join("");
    const alias = `#${suffix}`;

    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();

    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias unique après 10 tentatives");
}
