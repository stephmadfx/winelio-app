import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCommissionPaymentEmail } from "@/lib/notify-commission-payment";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app";

/**
 * Crée une Stripe Checkout Session pour la commission d'une recommandation.
 * Idempotente : retourne l'URL existante si une session pending existe déjà.
 * Appelée depuis advanceRecommendationStep() quand order_index === 7.
 */
export async function createStripeCheckoutSession(
  recommendationId: string
): Promise<string> {
  // ── 1. Vérification idempotente ──────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("stripe_session_id")
    .eq("recommendation_id", recommendationId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    const existingSession = await stripe.checkout.sessions.retrieve(
      existing.stripe_session_id
    );
    if (existingSession.status !== "expired" && existingSession.url) {
      return existingSession.url;
    }
    // Session expirée → marquer expired et en créer une nouvelle
    await supabaseAdmin
      .from("stripe_payment_sessions")
      .update({ status: "expired" })
      .eq("stripe_session_id", existing.stripe_session_id);
  }

  // ── 2. Récupérer la recommandation ───────────────────────────────────────────
  const { data: reco } = await supabaseAdmin
    .from("recommendations")
    .select(
      "id, amount, professional_id, referrer_id, compensation_plan_id, contact:contacts(first_name, last_name)"
    )
    .eq("id", recommendationId)
    .single();

  if (!reco) {
    throw new Error(`Recommandation ${recommendationId} introuvable`);
  }
  if (!reco.amount) {
    throw new Error(`Recommandation ${recommendationId} sans montant`);
  }

  // ── 3. Résoudre le plan de commission ────────────────────────────────────────
  let commissionRate = 10; // taux par défaut
  if (reco.compensation_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("id", reco.compensation_plan_id)
      .single();
    if (plan) commissionRate = plan.commission_rate;
  } else {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    if (defaultPlan) commissionRate = defaultPlan.commission_rate;
  }

  const commissionAmount =
    Math.round(reco.amount * (commissionRate / 100) * 100) / 100;

  // ── 4. Récupérer l'email du professionnel ────────────────────────────────────
  const { data: proAuth } = await supabaseAdmin.auth.admin.getUserById(
    reco.professional_id
  );
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
    ...(proEmail ? { customer_email: proEmail } : {}),
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Commission Winelio — ${clientName}`,
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
    },
    success_url: `${APP_URL}?commission=paid`,
    cancel_url: `${APP_URL}?commission=cancelled`,
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
    });

  if (insertError) {
    // Expirer la session Stripe pour éviter une double facturation au prochain appel
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch {
      // On a fait notre possible
    }
    throw new Error(`Impossible d'enregistrer la session de paiement: ${insertError.message}`);
  }

  // ── 8. Envoyer l'email (non-critique — échec logué mais non propagé) ──────────
  try {
    await sendCommissionPaymentEmail(
      reco.professional_id,
      clientName,
      commissionAmount,
      session.url
    );
  } catch (emailErr) {
    console.error("[stripe-checkout] Échec envoi email commission:", emailErr);
    // Ne pas faire échouer le flux — la session Stripe est créée et en DB
  }

  return session.url;
}
