/**
 * Assigne un parrain à un utilisateur s'il n'en a pas encore.
 * - Si sponsorCode fourni → utilise ce code
 * - Sinon → rotation round-robin parmi les fondateurs (is_founder = true)
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
  // Vérifier si l'utilisateur a déjà un parrain, ou s'il est tête de lignée
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("sponsor_id, is_founder")
    .eq("id", userId)
    .single();

  if (profile?.sponsor_id) return false;
  // Un fondateur reste tête de lignée, jamais rattaché à un parrain
  if (profile?.is_founder) return false;

  let sponsorId: string | null = null;

  if (sponsorCode) {
    const { data: sponsor } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("sponsor_code", sponsorCode)
      .neq("id", userId)
      .single();
    sponsorId = sponsor?.id ?? null;
  } else {
    sponsorId = await getNextFounderSponsor(userId);
  }

  if (!sponsorId) return false;

  await supabaseAdmin
    .from("profiles")
    .update({ sponsor_id: sponsorId })
    .eq("id", userId);

  return true;
}

/**
 * Rotation séquentielle pure entre les fondateurs (têtes de lignée).
 * Chacun son tour dans l'ordre de création, indépendamment du nombre de filleuls.
 * L'état est persisté dans winelio.founder_rotation (1 seule ligne).
 */
async function getNextFounderSponsor(excludeUserId: string): Promise<string | null> {
  const { data: founders } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("is_founder", true)
    .neq("id", excludeUserId)
    .order("created_at", { ascending: true });

  if (!founders || founders.length === 0) return null;

  const { data: state } = await supabaseAdmin
    .from("founder_rotation")
    .select("last_founder_id")
    .eq("id", 1)
    .maybeSingle();

  const lastIdx = state?.last_founder_id
    ? founders.findIndex((f) => f.id === state.last_founder_id)
    : -1;
  const nextIdx = (lastIdx + 1) % founders.length;
  const nextFounder = founders[nextIdx];

  // Persiste l'état — pas de lock, race condition bénigne en phase bêta
  await supabaseAdmin
    .from("founder_rotation")
    .update({
      last_founder_id: nextFounder.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  return nextFounder.id;
}
