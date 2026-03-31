"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  // Role stored in app_metadata (JWT), no extra DB query needed
  if (user.app_metadata?.role !== "super_admin") {
    throw new Error("Accès refusé");
  }
  return user;
}

// ─── Recommandations ──────────────────────────────────────────────────────────

export async function advanceRecommendationStep(
  recommendationId: string,
  stepOrder: number
) {
  await assertSuperAdmin();

  // Marquer l'étape comme complétée
  const { error: stepError } = await supabaseAdmin
    .from("recommendation_steps")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("recommendation_id", recommendationId)
    .eq("step_order", stepOrder);

  if (stepError) throw new Error(`Erreur mise à jour étape: ${stepError.message}`);

  // Si étape 6 (devis validé) : déclencher les commissions
  if (stepOrder === 6) {
    // Récupérer la recommandation pour avoir le montant
    const { data: reco } = await supabaseAdmin
      .from("recommendations")
      .select("id, referrer_id, professional_id, deal_amount")
      .eq("id", recommendationId)
      .single();

    if (reco && reco.deal_amount) {
      await createCommissionsForReco(reco);
    }
  }

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

async function createCommissionsForReco(reco: {
  id: string;
  referrer_id: string;
  professional_id: string;
  deal_amount: number;
}) {
  // Idempotency : vérifier si des commissions existent déjà pour cette recommandation
  const { count } = await supabaseAdmin
    .from("commission_transactions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", reco.id);

  if ((count ?? 0) > 0) return; // Déjà créées, ne pas dupliquer

  // Récupérer la chaîne de sponsors du referrer (5 niveaux)
  const commissions: Array<{
    recommendation_id: string;
    user_id: string;
    source_user_id: string;
    amount: number;
    type: string;
    level: number;
    status: string;
  }> = [];

  // Referrer : 60%
  commissions.push({
    recommendation_id: reco.id,
    user_id: reco.referrer_id,
    source_user_id: reco.referrer_id,
    amount: reco.deal_amount * 0.6,
    type: "referrer",
    level: 0,
    status: "EARNED",
  });

  // Remonter la chaîne de parrainage (niveaux 1-5 : 4% chacun)
  let currentId = reco.referrer_id;
  for (let level = 1; level <= 5; level++) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sponsor_id")
      .eq("id", currentId)
      .single();

    if (!profile?.sponsor_id) break;

    commissions.push({
      recommendation_id: reco.id,
      user_id: profile.sponsor_id,
      source_user_id: reco.referrer_id,
      amount: reco.deal_amount * 0.04,
      type: "mlm",
      level,
      status: "EARNED",
    });

    currentId = profile.sponsor_id;
  }

  if (commissions.length > 0) {
    await supabaseAdmin.from("commission_transactions").insert(commissions);
    // Recalculer les wallets des bénéficiaires
    for (const c of commissions) {
      await recalculateWallet(c.user_id);
    }
  }
}

export async function toggleRecommendationStatus(
  recommendationId: string,
  newStatus: string
) {
  await assertSuperAdmin();

  await supabaseAdmin
    .from("recommendations")
    .update({ status: newStatus })
    .eq("id", recommendationId);

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

// ─── Commissions ──────────────────────────────────────────────────────────────

export async function adjustCommission(
  userId: string,
  amount: number,
  reason: string
) {
  await assertSuperAdmin();

  await supabaseAdmin.from("commission_transactions").insert({
    user_id: userId,
    source_user_id: userId,
    amount,
    type: "manual_adjustment",
    level: 0,
    status: "EARNED",
    recommendation_id: null,
    notes: reason,
  });

  await recalculateWallet(userId);
  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
}

async function recalculateWallet(userId: string) {
  const { data: earned } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "EARNED");

  const totalEarned = (earned ?? []).reduce((s, t) => s + (t.amount ?? 0), 0);

  const { data: withdrawn } = await supabaseAdmin
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["approved", "paid"]);

  const totalWithdrawn = (withdrawn ?? []).reduce(
    (s, w) => s + (w.amount ?? 0),
    0
  );

  const { data: pending } = await supabaseAdmin
    .from("commission_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "PENDING");

  const totalPending = (pending ?? []).reduce(
    (s, t) => s + (t.amount ?? 0),
    0
  );

  await supabaseAdmin.from("user_wallet_summaries").upsert(
    {
      user_id: userId,
      total_earned: totalEarned,
      total_withdrawn: totalWithdrawn,
      pending_commissions: totalPending,
      available: totalEarned - totalWithdrawn,
    },
    { onConflict: "user_id" }
  );
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────

export async function suspendUser(userId: string) {
  await assertSuperAdmin();

  const { error: suspendError } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);

  if (suspendError) throw new Error(`Erreur suspension utilisateur: ${suspendError.message}`);

  // Désactiver via Supabase Auth Admin API
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h", // ~100 ans
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

export async function reactivateUser(userId: string) {
  await assertSuperAdmin();

  const { error: reactivateError } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId);

  if (reactivateError) throw new Error(`Erreur réactivation utilisateur: ${reactivateError.message}`);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  revalidatePath(`/gestion-reseau/utilisateurs/${userId}`);
  revalidatePath("/gestion-reseau/utilisateurs");
}

// ─── Retraits ─────────────────────────────────────────────────────────────────

export async function validateWithdrawal(withdrawalId: string, userId: string) {
  await assertSuperAdmin();

  const { error: validateError } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: "approved" })
    .eq("id", withdrawalId);

  if (validateError) throw new Error(`Erreur validation retrait: ${validateError.message}`);

  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}

export async function rejectWithdrawal(
  withdrawalId: string,
  userId: string,
  reason: string
) {
  await assertSuperAdmin();

  const { error: rejectError } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", withdrawalId);

  if (rejectError) throw new Error(`Erreur rejet retrait: ${rejectError.message}`);

  // Recréditer : recalculer le wallet (le retrait rejeté est exclu du total_withdrawn)
  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}

export async function markWithdrawalPaid(withdrawalId: string, userId: string) {
  await assertSuperAdmin();

  const { error: paidError } = await supabaseAdmin
    .from("withdrawals")
    .update({ status: "paid" })
    .eq("id", withdrawalId);

  if (paidError) throw new Error(`Erreur marquage retrait payé: ${paidError.message}`);

  await recalculateWallet(userId);
  revalidatePath("/gestion-reseau/retraits");
}
