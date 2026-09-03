import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { notifyContactAccepted } from "@/lib/notify-contact-accepted";
import {
  STRIPE_OFF_SESSION_CONSENT_TEXT,
  STRIPE_OFF_SESSION_TERMS_VERSION,
  STRIPE_OFF_SESSION_CONSENT_VERSION,
} from "@/lib/stripe-off-session-consent";
import { getLegalDocumentMarkdown } from "@/lib/legal-documents";
import { createHash } from "node:crypto";

/**
 * POST /api/stripe/payment-method
 *
 * Après confirmation client d'un SetupIntent, persiste le payment_method_id
 * sur le profil. La carte sert de gage de sérieux et débloque l'accès aux
 * coordonnées des leads et autorise les débits futurs hors session dans les
 * limites du consentement explicite présenté avant la création du SetupIntent.
 *
 * Body : { setupIntentId: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { setupIntentId } = await req.json();
    if (!setupIntentId) {
      return NextResponse.json({ error: "setupIntentId manquant" }, { status: 400 });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.metadata?.profile_id !== user.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (setupIntent.metadata?.consent_version !== STRIPE_OFF_SESSION_CONSENT_VERSION) {
      return NextResponse.json(
        { error: "Cette carte n’a pas été enregistrée avec l’autorisation requise." },
        { status: 409 },
      );
    }

    if (setupIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `SetupIntent non confirmé (status=${setupIntent.status})` },
        { status: 400 }
      );
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;

    if (!paymentMethodId) {
      return NextResponse.json({ error: "Moyen de paiement absent" }, { status: 400 });
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const { data: currentProfile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("id", user.id)
      .single();
    const setupCustomerId = typeof setupIntent.customer === "string"
      ? setupIntent.customer
      : setupIntent.customer?.id;
    if (!currentProfile?.stripe_customer_id || setupCustomerId !== currentProfile.stripe_customer_id) {
      return NextResponse.json(
        { error: "La session Stripe ne correspond plus à votre compte. Recommencez." },
        { status: 409 },
      );
    }

    const termsMarkdown = getLegalDocumentMarkdown("conditions-professionnels");
    if (!termsMarkdown) {
      return NextResponse.json({ error: "Conditions Professionnels indisponibles." }, { status: 503 });
    }
    const termsHash = createHash("sha256").update(termsMarkdown).digest("hex");

    const { error: consentError } = await supabaseAdmin.rpc(
      "record_stripe_payment_method_consent",
      {
        p_user_id: user.id,
        p_setup_intent_id: setupIntent.id,
        p_payment_method_id: paymentMethodId,
        p_brand: paymentMethod.card?.brand ?? null,
        p_last4: paymentMethod.card?.last4 ?? null,
        p_consent_version: STRIPE_OFF_SESSION_CONSENT_VERSION,
        p_consent_text: STRIPE_OFF_SESSION_CONSENT_TEXT,
        p_terms_version: STRIPE_OFF_SESSION_TERMS_VERSION,
        p_terms_hash: termsHash,
        p_user_agent: req.headers.get("user-agent"),
      },
    );

    if (consentError) {
      console.error("stripe/payment-method consent error:", consentError);
      return NextResponse.json(
        { error: "Impossible d’enregistrer la preuve d’autorisation." },
        { status: 500 },
      );
    }

    if (
      currentProfile.stripe_payment_method_id &&
      currentProfile.stripe_payment_method_id !== paymentMethodId
    ) {
      await stripe.paymentMethods.detach(currentProfile.stripe_payment_method_id).catch((error) =>
        console.warn("[payment-method] Ancienne carte non détachée:", error),
      );
    }

    // Le pro a maintenant réellement accès à ses leads : prévenir les clients
    // des recos acceptées mais pas encore notifiées (dédupliqué par reco).
    try {
      const { data: acceptedRecs } = await supabaseAdmin
        .from("recommendations")
        .select("id")
        .eq("professional_id", user.id)
        .eq("status", "ACCEPTED");

      for (const r of acceptedRecs ?? []) {
        await notifyContactAccepted(r.id);
      }
    } catch (err) {
      console.error("[payment-method] notifyContactAccepted failed:", err);
    }

    return NextResponse.json({
      success: true,
      brand: paymentMethod.card?.brand ?? null,
      last4: paymentMethod.card?.last4 ?? null,
    });
  } catch (err) {
    console.error("stripe/payment-method error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE /api/stripe/payment-method
 *
 * Retire la carte du profil (détache aussi côté Stripe).
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_payment_method_id")
      .eq("id", user.id)
      .single();

    if (profile?.stripe_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(profile.stripe_payment_method_id);
      } catch (err) {
        console.warn("detach payment method failed:", err);
      }
    }

    const { error: revokeError } = await supabaseAdmin.rpc(
      "revoke_stripe_payment_method_consent",
      { p_user_id: user.id },
    );
    if (revokeError) {
      throw new Error(`Révocation du moyen de paiement impossible: ${revokeError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE stripe/payment-method error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
