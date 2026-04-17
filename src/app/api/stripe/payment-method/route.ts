import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/stripe/payment-method
 *
 * Après confirmation client d'un SetupIntent, persiste le payment_method_id
 * sur le profil pour permettre un débit off-session à l'étape 7.
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

    await supabaseAdmin
      .from("profiles")
      .update({
        stripe_payment_method_id: paymentMethodId,
        stripe_payment_method_brand: paymentMethod.card?.brand ?? null,
        stripe_payment_method_last4: paymentMethod.card?.last4 ?? null,
        stripe_payment_method_saved_at: new Date().toISOString(),
      })
      .eq("id", user.id);

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

    await supabaseAdmin
      .from("profiles")
      .update({
        stripe_payment_method_id: null,
        stripe_payment_method_brand: null,
        stripe_payment_method_last4: null,
        stripe_payment_method_saved_at: null,
      })
      .eq("id", user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE stripe/payment-method error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
