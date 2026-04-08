"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";

/**
 * Assigne un parrain à l'utilisateur courant.
 * Règle MLM : impossible si un sponsor_id est déjà défini.
 */
export async function assignSponsor(sponsorCode: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const supabase = await createClient();

  // Vérifie que l'utilisateur n'a pas déjà un parrain
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("sponsor_id")
    .eq("id", user.id)
    .single();

  if (currentProfile?.sponsor_id) {
    return { error: "Vous avez déjà un parrain, cette relation est permanente." };
  }

  const trimmed = sponsorCode.trim().toLowerCase();

  // Vérifie que le code n'est pas dans les codes supprimés
  const { data: deleted } = await supabase
    .from("deleted_sponsor_codes")
    .select("code")
    .eq("code", trimmed)
    .maybeSingle();

  if (deleted) return { error: "Ce code parrain n'est plus disponible." };

  // Trouve le sponsor
  const { data: sponsor } = await supabase
    .from("profiles")
    .select("id")
    .eq("sponsor_code", trimmed)
    .single();

  if (!sponsor) return { error: "Code parrain invalide." };

  const { error } = await supabase
    .from("profiles")
    .update({ sponsor_id: sponsor.id })
    .eq("id", user.id);

  if (error) return { error: "Erreur lors de l'ajout du parrain." };

  return {};
}
