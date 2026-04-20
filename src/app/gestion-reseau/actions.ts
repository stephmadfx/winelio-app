"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recalculateWallet } from "@/lib/wallet";
import { COMMISSION_TYPE, COMMISSION_STATUS, WITHDRAWAL_STATUS } from "@/lib/constants";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
import { notifyBugStatusChange } from "@/lib/notify-bug-status";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  if (user.app_metadata?.role !== "super_admin") {
    throw new Error("Accès refusé");
  }
  return user;
}

async function assertBugDeletePermission() {
  const user = await assertSuperAdmin();
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("is_founder, email")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Erreur lecture profil: ${error.message}`);

  const canDelete =
    Boolean(profile?.is_founder) ||
    user.email?.toLowerCase() === "contact@aide-multimedia.fr";

  if (!canDelete) {
    throw new Error("Accès refusé");
  }
  return user;
}

async function getBugReporterContact(userId: string) {
  const [{ data: profile }, authResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);

  const email = profile?.email ?? authResult.data?.user?.email ?? null;
  const firstName = profile?.first_name ?? authResult.data?.user?.user_metadata?.first_name ?? null;
  const lastName = profile?.last_name ?? authResult.data?.user?.user_metadata?.last_name ?? null;

  return { email, firstName, lastName };
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

  // Récupérer l'order_index de l'étape validée
  const { data: stepRow } = await supabaseAdmin
    .from("recommendation_steps")
    .select("step:steps(order_index)")
    .eq("id", stepId)
    .single();

  const stepData = Array.isArray(stepRow?.step) ? stepRow.step[0] : stepRow?.step;
  const orderIndex = (stepData as { order_index: number } | null | undefined)?.order_index;

  if (orderIndex === 7) {
    // Déclencher le paiement Stripe de la commission pro
    try {
      await createStripeCheckoutSession(recommendationId);
    } catch (err) {
      console.error("[Stripe] Erreur création session checkout:", err);
    }
  }

  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
  revalidatePath("/gestion-reseau/recommandations");
}

const VALID_STATUSES = [
  "PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED",
  "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED", "COMPLETED", "CANCELLED",
] as const;

const BUG_TRACKING_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
const BUG_TICKET_TYPES = ["bug", "improvement", "site_change"] as const;
const BUG_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function validateBugTrackingStatus(value?: string) {
  return !value || BUG_TRACKING_STATUSES.includes(value as typeof BUG_TRACKING_STATUSES[number]);
}

function validateBugTicketType(value?: string) {
  return !value || BUG_TICKET_TYPES.includes(value as typeof BUG_TICKET_TYPES[number]);
}

function validateBugPriority(value?: string) {
  return !value || BUG_PRIORITIES.includes(value as typeof BUG_PRIORITIES[number]);
}

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

// ─── Bugs / idées ───────────────────────────────────────────────────────────

export async function updateBugReportBoard(
  reportId: string,
  data: {
    trackingStatus?: string;
    ticketType?: string;
    priority?: string;
    internalNote?: string;
  }
) {
  await assertSuperAdmin();

  const { data: currentReport, error: currentError } = await supabaseAdmin
    .from("bug_reports")
    .select("id, user_id, message, page_url, tracking_status, in_progress_notified_at, done_notified_at")
    .eq("id", reportId)
    .maybeSingle();

  if (currentError) throw new Error(`Erreur lecture bug: ${currentError.message}`);
  if (!currentReport) throw new Error("Carte introuvable");
  const reporterContact = await getBugReporterContact(currentReport.user_id);

  if (data.trackingStatus && !BUG_TRACKING_STATUSES.includes(data.trackingStatus as typeof BUG_TRACKING_STATUSES[number])) {
    throw new Error(`Statut de suivi invalide: ${data.trackingStatus}`);
  }

  if (data.ticketType && !BUG_TICKET_TYPES.includes(data.ticketType as typeof BUG_TICKET_TYPES[number])) {
    throw new Error(`Type de ticket invalide: ${data.ticketType}`);
  }

  if (data.priority && !BUG_PRIORITIES.includes(data.priority as typeof BUG_PRIORITIES[number])) {
    throw new Error(`Priorité invalide: ${data.priority}`);
  }

  const payload: Record<string, string> = {};
  if (data.trackingStatus) payload.tracking_status = data.trackingStatus;
  if (data.ticketType) payload.ticket_type = data.ticketType;
  if (data.priority) payload.priority = data.priority;
  if (typeof data.internalNote === "string") payload.internal_note = data.internalNote.trim();

  const { error } = await supabaseAdmin
    .from("bug_reports")
    .update(payload)
    .eq("id", reportId);

  if (error) throw new Error(`Erreur mise à jour bug: ${error.message}`);

  const nextStatus = data.trackingStatus ?? currentReport.tracking_status;
  const notificationUpdates: Record<string, string> = {};

  if (
    nextStatus === "in_progress" &&
    !currentReport.in_progress_notified_at &&
    currentReport.tracking_status !== "in_progress"
  ) {
    try {
      const sent = await notifyBugStatusChange({
        userId: currentReport.user_id,
        reportId,
        firstName: reporterContact.firstName,
        email: reporterContact.email,
        pageUrl: currentReport.page_url,
        message: currentReport.message,
        kind: "in_progress",
      });

      if (sent) {
        notificationUpdates.in_progress_notified_at = new Date().toISOString();
      }
    } catch (err) {
      console.error("[bug/status] Notification in_progress failed:", err);
    }
  }

  if (
    nextStatus === "done" &&
    !currentReport.done_notified_at &&
    currentReport.tracking_status !== "done"
  ) {
    try {
      const sent = await notifyBugStatusChange({
        userId: currentReport.user_id,
        reportId,
        firstName: reporterContact.firstName,
        email: reporterContact.email,
        pageUrl: currentReport.page_url,
        message: currentReport.message,
        kind: "done",
      });

      if (sent) {
        notificationUpdates.done_notified_at = new Date().toISOString();
      }
    } catch (err) {
      console.error("[bug/status] Notification done failed:", err);
    }
  }

  if (Object.keys(notificationUpdates).length > 0) {
    const { error: flagError } = await supabaseAdmin
      .from("bug_reports")
      .update(notificationUpdates)
      .eq("id", reportId);

    if (flagError) {
      console.error("[bug/status] Notification flag update error:", flagError.message);
    }
  }

  revalidatePath("/gestion-reseau/bugs");
  revalidatePath("/gestion-reseau");
}

export async function createBugReportCard(
  data: {
    message: string;
    pageUrl?: string;
    trackingStatus?: string;
    ticketType?: string;
    priority?: string;
    internalNote?: string;
  }
): Promise<
  | { ok: true; report: {
      id: string;
      user_id: string;
      message: string;
      page_url: string | null;
      status: string;
      admin_reply: string | null;
      reply_images: string[] | null;
      created_at: string;
      replied_at: string | null;
      tracking_status: string;
      ticket_type: string;
      priority: string;
      internal_note: string | null;
      updated_at: string | null;
      screenshot_url: string | null;
      screenshot_signed_url: string | null;
      reporter: { first_name: string | null; last_name: string | null; email: string | null } | null;
      source: string;
    } }
  | { ok: false; error: string }
> {
  try {
    const user = await assertSuperAdmin();

    const message = data.message.trim();
    if (!message) return { ok: false, error: "Le message est requis." };

    if (!validateBugTrackingStatus(data.trackingStatus)) {
      return { ok: false, error: "Statut de suivi invalide." };
    }
    if (!validateBugTicketType(data.ticketType)) {
      return { ok: false, error: "Type de ticket invalide." };
    }
    if (!validateBugPriority(data.priority)) {
      return { ok: false, error: "Priorité invalide." };
    }

    const reporterContact = await getBugReporterContact(user.id);
    const reportId = crypto.randomUUID();
    const now = new Date().toISOString();
    const source = "manual" as const;

    const { error } = await supabaseAdmin
      .from("bug_reports")
      .insert({
        id: reportId,
        user_id: user.id,
        message,
        page_url: data.pageUrl?.trim() || null,
        tracking_status: data.trackingStatus ?? "todo",
        ticket_type: data.ticketType ?? "bug",
        priority: data.priority ?? "medium",
        internal_note: data.internalNote?.trim() || null,
        source,
        created_at: now,
        updated_at: now,
      });

    if (error) return { ok: false, error: `Erreur création carte: ${error.message}` };

    revalidatePath("/gestion-reseau/bugs");
    revalidatePath("/gestion-reseau");

    return {
      ok: true,
      report: {
        id: reportId,
        user_id: user.id,
        message,
        page_url: data.pageUrl?.trim() || null,
        status: "pending",
        admin_reply: null,
        reply_images: null,
        created_at: now,
        replied_at: null,
        tracking_status: data.trackingStatus ?? "todo",
        ticket_type: data.ticketType ?? "bug",
        priority: data.priority ?? "medium",
        internal_note: data.internalNote?.trim() || null,
        updated_at: now,
        screenshot_url: null,
        screenshot_signed_url: null,
        reporter: {
          first_name: reporterContact.firstName,
          last_name: reporterContact.lastName,
          email: reporterContact.email,
        },
        source,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Impossible de créer la carte" };
  }
}

export async function deleteBugReport(reportId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await assertBugDeletePermission();

    const { data: report, error: fetchError } = await supabaseAdmin
      .from("bug_reports")
      .select("id, screenshot_url")
      .eq("id", reportId)
      .maybeSingle();

    if (fetchError) throw new Error(`Erreur lecture bug: ${fetchError.message}`);
    if (!report) {
      revalidatePath("/gestion-reseau/bugs");
      revalidatePath("/gestion-reseau");
      return { ok: true };
    }

    if (report.screenshot_url) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("bug-screenshots")
        .remove([report.screenshot_url]);

      if (storageError) {
        console.error("[bug/delete] Storage delete error:", storageError);
      }
    }

    const { error } = await supabaseAdmin
      .from("bug_reports")
      .delete()
      .eq("id", reportId);

    if (error?.message?.includes("0 rows")) {
      revalidatePath("/gestion-reseau/bugs");
      revalidatePath("/gestion-reseau");
      return { ok: true };
    }

    if (error) throw new Error(`Erreur suppression bug: ${error.message}`);

    revalidatePath("/gestion-reseau/bugs");
    revalidatePath("/gestion-reseau");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Impossible de supprimer la carte";
    console.error("[bug/delete] Failed:", err);
    return { ok: false, error: message };
  }
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

// ─── Entreprises ──────────────────────────────────────────────────────────────

export async function verifyCompany(companyId: string, verified: boolean) {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("companies")
    .update({ is_verified: verified })
    .eq("id", companyId);

  if (error) throw new Error(`Erreur mise à jour entreprise: ${error.message}`);

  revalidatePath("/gestion-reseau/professionnels");
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
