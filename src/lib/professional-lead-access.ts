import { supabaseAdmin } from "@/lib/supabase/admin";

export type LeadAccessBlock = {
  sessionId: string;
  recommendationId: string;
  amount: number;
  blockedSince: string;
};

export const getProfessionalLeadAccessBlock = async (
  professionalId: string
): Promise<LeadAccessBlock | null> => {
  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .from("stripe_payment_sessions")
    .select(
      "id, recommendation_id, amount, created_at, recommendation:recommendations!inner(professional_id)"
    )
    .eq("status", "pending")
    .eq("recommendation.professional_id", professionalId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[lead-access] Impossible de vérifier les commissions impayées:", error);
    return null;
  }

  if (!data) return null;

  return {
    sessionId: data.id,
    recommendationId: data.recommendation_id,
    amount: Number(data.amount),
    blockedSince: data.created_at,
  };
};

export const isFutureLeadBlocked = (
  recommendation: { id: string; created_at: string },
  block: LeadAccessBlock | null
) => {
  if (!block) return false;
  if (recommendation.id === block.recommendationId) return false;
  return new Date(recommendation.created_at).getTime() >
    new Date(block.blockedSince).getTime();
};
