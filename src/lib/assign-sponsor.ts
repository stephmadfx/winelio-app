/**
 * Assigne un parrain à un utilisateur s'il n'en a pas encore.
 * Uniquement avec un code valide fourni explicitement, sans attribution automatique.
 * Retourne true si un sponsor a été assigné, false sinon.
 *
 * Note : l'email de notification au parrain N'EST PAS envoyé ici.
 * Il est envoyé lors de la première complétion de profil (voir updateProfile).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function assignSponsorIfNeeded(
  userId: string,
  sponsorCode?: string | null
): Promise<boolean> {
  const code = typeof sponsorCode === "string" ? sponsorCode.trim().toUpperCase() : "";
  if (!code) return false;
  // Vérifier si l'utilisateur a déjà un parrain, ou s'il est tête de lignée
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("sponsor_id, is_founder")
    .eq("id", userId)
    .single();

  if (profile?.sponsor_id) return false;
  // Un fondateur reste tête de lignée, jamais rattaché à un parrain
  if (profile?.is_founder) return false;

  const { data: sponsor, error: sponsorError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("sponsor_code", code)
    .eq("is_active", true)
    .neq("id", userId)
    .maybeSingle();
  if (sponsorError || !sponsor) return false;

  const { data: assigned, error } = await supabaseAdmin
    .from("profiles")
    .update({ sponsor_id: sponsor.id })
    .eq("id", userId)
    .is("sponsor_id", null)
    .select("id");

  return !error && assigned?.length === 1;
}
