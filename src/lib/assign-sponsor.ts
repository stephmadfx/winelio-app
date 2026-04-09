/**
 * Assigne un parrain à un utilisateur s'il n'en a pas encore.
 * - Si sponsorCode fourni → utilise ce code
 * - Sinon → rotation round-robin parmi les fondateurs (is_founder = true)
 * Retourne true si un sponsor a été assigné, false sinon.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewReferral } from "@/lib/notify-new-referral";

export async function assignSponsorIfNeeded(
  userId: string,
  sponsorCode?: string | null
): Promise<boolean> {
  // Vérifier si l'utilisateur a déjà un parrain
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("sponsor_id")
    .eq("id", userId)
    .single();

  if (profile?.sponsor_id) return false;

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

  // Notification non bloquante
  notifyNewReferral(userId).catch((err) =>
    console.error("notify-new-referral error:", err)
  );

  return true;
}

async function getNextFounderSponsor(excludeUserId: string): Promise<string | null> {
  const { data: founders } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("is_founder", true)
    .neq("id", excludeUserId)
    .order("created_at", { ascending: true });

  if (!founders || founders.length === 0) return null;

  const counts = await Promise.all(
    founders.map(async (f) => {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", f.id);
      return { id: f.id, count: count ?? 0 };
    })
  );

  counts.sort((a, b) => a.count - b.count);
  return counts[0].id;
}
