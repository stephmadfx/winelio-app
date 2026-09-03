import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCommissionPaymentEmail } from "@/lib/notify-commission-payment";
import { calculateCommissionBaseAmount } from "@/lib/commission-rate";
import { assertValidCompensationPlan, type CompensationPlan } from "@/lib/commission";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

/**
 * Crée une Stripe Checkout Session pour la commission d'une recommandation.
 * Idempotente : retourne l'URL existante si une session pending existe déjà.
 * Appelée à l'étape 7, quand le professionnel déclare avoir encaissé son client.
 */
export async function createStripeCheckoutSession(
  recommendationId: string,
  options: { notifyProfessional?: boolean; automaticAttemptFailed?: boolean } = {},
): Promise<string> {
  const notifyProfessional = options.notifyProfessional ?? true;
  // ── 1. Vérification idempotente ──────────────────────────────────────────────
  const { data: paid, error: paidError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "paid")
    .maybeSingle();

  if (paidError) throw new Error(`Erreur lecture paiement existant: ${paidError.message}`);

  if (paid) {
    return `${APP_URL}?commission=already-paid`;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("stripe_session_id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) throw new Error(`Erreur lecture session existante: ${existingError.message}`);

  if (existing) {
    if (!existing.stripe_session_id) {
      throw new Error("Session Stripe de régularisation incomplète.");
    }
    const existingSession = await stripe.checkout.sessions.retrieve(
      existing.stripe_session_id
    );
    if (existingSession.payment_status === "paid" || existingSession.status === "complete") {
      throw new Error("Cette commission est déjà réglée ou en cours de confirmation.");
    }
    if (existingSession.status === "open" && existingSession.url) {
      return existingSession.url;
    }
    // Session expirée → marquer expired et en créer une nouvelle
    const { error: expireError } = await supabaseAdmin
      .from("stripe_payment_sessions")
      .update({ status: "expired" })
      .eq("stripe_session_id", existing.stripe_session_id);
    if (expireError) throw new Error(`Erreur expiration session: ${expireError.message}`);
  }

  // ── 2. Récupérer la recommandation ───────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select(
      "id, amount, professional_id, referrer_id, compensation_plan_id, is_demo, contact:contacts(first_name, last_name, email)"
    )
    .eq("id", recommendationId)
    .single();

  if (!reco) {
    throw new Error(`Recommandation ${recommendationId} introuvable`);
  }
  if (!reco.amount) {
    throw new Error(`Recommandation ${recommendationId} sans montant`);
  }

  // Les recommandations de démonstration/E2E ne doivent jamais créer de
  // paiement réel chez Stripe.
  const testContactRaw = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
  if (
    reco.is_demo ||
    testContactRaw?.email?.toLowerCase().endsWith("@winelio-e2e.local")
  ) {
    return `${APP_URL}?commission=test-skipped`;
  }

  // ── 3. Résoudre le plan de commission ────────────────────────────────────────
  let resolvedPlan: CompensationPlan | null = null;
  if (reco.compensation_plan_id) {
    const { data: plan, error: planError } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("id", reco.compensation_plan_id)
      .single();
    if (planError) throw new Error(`Lecture du plan de commission impossible: ${planError.message}`);
    resolvedPlan = plan as CompensationPlan | null;
  } else {
    const { data: defaultPlan, error: planError } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    if (planError) throw new Error(`Lecture du plan de commission impossible: ${planError.message}`);
    resolvedPlan = defaultPlan as CompensationPlan | null;
  }

  if (!resolvedPlan) throw new Error("Aucun plan de commission actif");
  assertValidCompensationPlan(resolvedPlan);

  const { amount: commissionAmount, rate: commissionRate } =
    calculateCommissionBaseAmount(reco.amount, resolvedPlan);

  // ── 4. Récupérer le compte Stripe et l'email du professionnel ────────────────
  const [{ data: proAuth }, { data: proProfile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(reco.professional_id),
    supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", reco.professional_id)
      .single(),
  ]);
  const proEmail = proAuth?.user?.email;

  // ── 5. Construire le nom du client ───────────────────────────────────────────
  const contactRaw = reco.contact;
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
  const clientName = contact
    ? `${(contact as { first_name?: string | null; last_name?: string | null }).first_name ?? ""} ${(contact as { first_name?: string | null; last_name?: string | null }).last_name ?? ""}`.trim()
    : "Client";

  // ── 6. Créer la Stripe Checkout Session ──────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(proProfile?.stripe_customer_id
      ? {
          customer: proProfile.stripe_customer_id,
        }
      : proEmail
        ? { customer_email: proEmail }
        : {}),
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Commission d'intermédiation Winelio — ${clientName}`,
            description: `Recommandation #${recommendationId.slice(0, 8)} · Montant du deal : ${reco.amount} €`,
          },
          unit_amount: Math.round(commissionAmount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      recommendation_id: recommendationId,
      professional_id: reco.professional_id,
      deal_amount: String(reco.amount),
      commission_rate: String(commissionRate),
    },
    success_url: `${APP_URL}/commission/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/commission/success?status=cancelled`,
    // Stripe maximum : 24h (86400s)
    expires_at: Math.floor(Date.now() / 1000) + 86400,
  });

  if (!session.url)
    throw new Error("Stripe n'a pas retourné d'URL de checkout");

  // ── 7. Sauvegarder en DB (avant email — si l'insert échoue, expirer la session Stripe) ─────
  const { error: insertError } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .insert({
      recommendation_id: recommendationId,
      stripe_session_id: session.id,
      amount: commissionAmount,
      payment_mode: "checkout",
      deal_amount: reco.amount,
      commission_rate: commissionRate,
      compensation_plan_id: resolvedPlan.id,
      plan_snapshot: resolvedPlan,
    });

  if (insertError) {
    // Expirer la session Stripe pour éviter une double facturation au prochain appel
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch {
      // On a fait notre possible
    }
    if (insertError.code === "23505") {
      const { data: concurrent } = await supabaseAdmin
        .from("stripe_payment_sessions")
        .select("stripe_session_id")
        .eq("recommendation_id", recommendationId)
        .eq("status", "pending")
        .maybeSingle();
      if (concurrent) {
        const concurrentSession = await stripe.checkout.sessions.retrieve(
          concurrent.stripe_session_id
        );
        if (concurrentSession.status === "open" && concurrentSession.url) {
          return concurrentSession.url;
        }
      }
    }
    throw new Error(`Impossible d'enregistrer la session de paiement: ${insertError.message}`);
  }

  // ── 8. Envoyer l'email (non-critique — échec logué mais non propagé) ──────────
  if (notifyProfessional) {
    try {
      await sendCommissionPaymentEmail(
        reco.professional_id,
        recommendationId,
        clientName,
        commissionAmount,
        session.url,
        options.automaticAttemptFailed ?? false,
      );
    } catch (emailErr) {
      console.error("[stripe-checkout] Échec envoi email commission:", emailErr);
      // Ne pas faire échouer le flux — la session Stripe est créée et en DB
    }
  }

  return session.url;
}
