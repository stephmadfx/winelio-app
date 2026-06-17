import { supabaseAdmin } from "@/lib/supabase/admin";
import { WITHDRAWAL_STATUS, COMMISSION_TYPE } from "@/lib/constants";

/**
 * Recalcule le wallet d'un utilisateur depuis zéro.
 * À appeler après toute action admin sur les retraits (validation, rejet, paiement)
 * ou après un ajustement manuel de commission.
 *
 * Pour les commissions créées via complete-step (route utilisateur),
 * le trigger DB `on_commission_change` gère la mise à jour automatiquement.
 */
export async function recalculateWallet(userId: string): Promise<void> {
  const { data: earned } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .eq("status", "EARNED");

  const totalEarned = (earned ?? [])
    .filter((t) => t.type !== COMMISSION_TYPE.PROFESSIONAL_CASHBACK)
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  const totalWins = (earned ?? [])
    .filter((t) => t.type === COMMISSION_TYPE.PROFESSIONAL_CASHBACK)
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  const { data: withdrawn } = await supabaseAdmin
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", [WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.COMPLETED]);

  const totalWithdrawn = (withdrawn ?? []).reduce((s, w) => s + (w.amount ?? 0), 0);

  const { data: pending } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .eq("status", "PENDING");

  const totalPending = (pending ?? [])
    .filter((t) => t.type !== COMMISSION_TYPE.PROFESSIONAL_CASHBACK)
    .reduce((s, t) => s + (t.amount ?? 0), 0);

  // Récupérer les redeemed_wins existants pour ne pas les écraser
  const { data: currentWallet } = await supabaseAdmin
    .from("user_wallet_summaries")
    .select("redeemed_wins")
    .eq("user_id", userId)
    .maybeSingle();

  const redeemedWins = currentWallet?.redeemed_wins ?? 0;

  await supabaseAdmin.from("user_wallet_summaries").upsert(
    {
      user_id: userId,
      total_earned: totalEarned,
      total_withdrawn: totalWithdrawn,
      pending_commissions: totalPending,
      available: Math.max(0, totalEarned - totalWithdrawn),
      total_wins: totalWins,
      available_wins: Math.max(0, totalWins - redeemedWins),
    },
    { onConflict: "user_id" }
  );
}

