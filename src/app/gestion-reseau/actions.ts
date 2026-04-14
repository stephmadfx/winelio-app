"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCommissions } from "@/lib/commission";
import { recalculateWallet } from "@/lib/wallet";
import { COMMISSION_TYPE, COMMISSION_STATUS, WITHDRAWAL_STATUS } from "@/lib/constants";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  if (user.app_metadata?.role !== "super_admin") {
    throw new Error("Accès refusé");
  }
  return user;
}

// ─── Recommandations ──────────────────────────────────────────────────────────

export async function advanceRecommendationStep(
  recommendationId: string,
  stepId: string
) {
  await assertSuperAdmin();

  const { error: stepError } = await supabaseAdmin
    .from("recommendation_steps")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", stepId);

  if (stepError) throw new Error(`Erreur mise à jour étape: ${stepError.message}`);

  // Vérifier si c'est l'étape "devis validé" (order_index=6) pour déclencher les commissions
  const { data: stepRow } = await supabaseAdmin
    .from("recommendation_steps")
    .select("step:steps(order_index)")
    .eq("id", stepId)
    .single();

  const stepData = Array.isArray(stepRow?.step) ? stepRow.step[0] : stepRow?.step;
  const orderIndex = (stepData as { order_index: number } | null | undefined)?.order_index;

  if (orderIndex === 6) {
    const { data: reco } = await supabaseAdmin
      .from("recommendations")
      .select("id, referrer_id, professional_id, amount, compensation_plan_id")
      .eq("id", recommendationId)
      .single();

    if (reco?.amount) {
      await createCommissions(reco.id, reco.referrer_id, reco.professional_id, reco.amount, reco.compensation_plan_id ?? null);
      // Recalcule les wallets des bénéficiaires après insertion
      const { data: newCommissions } = await supabaseAdmin
        .from("commission_transactions")
        .select("user_id")
        .eq("recommendation_id", reco.id);
      const uniqueUsers = [...new Set((newCommissions ?? []).map((c) => c.user_id))];
      for (const userId of uniqueUsers) {
        await recalculateWallet(userId);
      }
    }
  }

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

const VALID_STATUSES = [
  "PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED", "COMPLETED", "CANCELLED",
] as const;

export async function toggleRecommendationStatus(
  recommendationId: string,
  newStatus: string
) {
  await assertSuperAdmin();

  if (!VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
    throw new Error(`Statut invalide: ${newStatus}`);
  }

  await supabaseAdmin
    .from("recommendations")
    .update({ status: newStatus })
    .eq("id", recommendationId);

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

// ─── Commissions ──────────────────────────────────────────────────────────────

const MAX_ADJUSTMENT = 10_000;

export async function adjustCommission(
  userId: string,
  amount: number,
  reason: string
) {
  await assertSuperAdmin();

  if (typeof amount !== "number" || isNaN(amount) || Math.abs(amount) > MAX_ADJUSTMENT) {
    throw new Error(`Montant invalide ou hors limite (max ±${MAX_ADJUSTMENT}€)`);
  }

  await supabaseAdmin.from("commission_transactions").insert({
    user_id: userId,
    amount,
    type: COMMISSION_TYPE.MANUAL_ADJUSTMENT,
    level: 0,
    status: COMMISSION_STATUS.EARNED,
    recommendation_id: null,
    notes: reason,
  });

  await recalculateWallet(userId);
  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────

export async function suspendUser(userId: string) {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);

  if (error) throw new Error(`Erreur suspension utilisateur: ${error.message}`);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

export async function reactivateUser(userId: string) {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId);

  if (error) throw new Error(`Erreur réactivation utilisateur: ${error.message}`);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

// ─── Retraits ─────────────────────────────────────────────────────────────────

export async function validateWithdrawal(withdrawalId: string) {
  await assertSuperAdmin();

  const { data: w } = await supabaseAdmin
    .from("withdrawals")
    .select("user_id, status")
    .eq("id", withdrawalId)
    .single();

  if (!w) throw new Error("Retrait introuvable");
  if (w.status !== WITHDRAWAL_STATUS.PENDING) throw new Error("Ce retrait n'est pas en attente");

  const { error } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: WITHDRAWAL_STATUS.PROCESSING })
    .eq("id", withdrawalId)
    .eq("status", WITHDRAWAL_STATUS.PENDING);

  if (error) throw new Error(`Erreur validation retrait: ${error.message}`);

  await recalculateWallet(w.user_id);
  revalidatePath("/gestion-reseau/retraits");
}

export async function rejectWithdrawal(withdrawalId: string, reason: string) {
  await assertSuperAdmin();

  const { data: w } = await supabaseAdmin
    .from("withdrawals")
    .select("user_id, status")
    .eq("id", withdrawalId)
    .single();

  if (!w) throw new Error("Retrait introuvable");
  if (w.status !== WITHDRAWAL_STATUS.PENDING) throw new Error("Ce retrait n'est pas en attente");

  const { error } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: WITHDRAWAL_STATUS.REJECTED, rejection_reason: reason })
    .eq("id", withdrawalId)
    .eq("status", WITHDRAWAL_STATUS.PENDING);

  if (error) throw new Error(`Erreur rejet retrait: ${error.message}`);

  await recalculateWallet(w.user_id);
  revalidatePath("/gestion-reseau/retraits");
}

export async function markWithdrawalPaid(withdrawalId: string) {
  await assertSuperAdmin();

  const { data: w } = await supabaseAdmin
    .from("withdrawals")
    .select("user_id, status")
    .eq("id", withdrawalId)
    .single();

  if (!w) throw new Error("Retrait introuvable");
  if (w.status !== WITHDRAWAL_STATUS.PROCESSING) throw new Error("Ce retrait n'est pas en cours de traitement");

  const { error } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: WITHDRAWAL_STATUS.COMPLETED })
    .eq("id", withdrawalId)
    .eq("status", WITHDRAWAL_STATUS.PROCESSING);

  if (error) throw new Error(`Erreur marquage retrait payé: ${error.message}`);

  await recalculateWallet(w.user_id);
  revalidatePath("/gestion-reseau/retraits");
}
