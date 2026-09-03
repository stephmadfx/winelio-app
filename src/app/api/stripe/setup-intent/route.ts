import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { STRIPE_OFF_SESSION_CONSENT_VERSION } from "@/lib/stripe-off-session-consent";

/**
 * POST /api/stripe/setup-intent
 *
 * Crée (ou récupère) un Stripe Customer pour le pro connecté, puis crée un
 * SetupIntent qui permettra de sauvegarder une carte sans débit immédiat.
 * Le client confirme ensuite la saisie via Stripe Elements, puis appelle
 * POST /api/stripe/payment-method pour persister le payment_method_id.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (
      body?.consentAccepted !== true ||
      body?.consentVersion !== STRIPE_OFF_SESSION_CONSENT_VERSION
    ) {
      return NextResponse.json(
        { error: "L’autorisation explicite des débits futurs est requise." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_customer_id, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }

    let customerId = profile.stripe_customer_id;

    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if (existing.deleted) {
          customerId = null;
        }
      } catch (err) {
        const stripeError = err as { code?: string; statusCode?: number };
        if (stripeError.code === "resource_missing" || stripeError.statusCode === 404) {
          // ID issu d'un autre mode Stripe ou Customer réellement supprimé.
          customerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined,
        metadata: { profile_id: profile.id },
      });
      customerId = customer.id;

      const { error: customerSaveError } = await supabaseAdmin
        .from("profiles")
        .update({
          stripe_customer_id: customerId,
          stripe_payment_method_id: null,
          stripe_payment_method_brand: null,
          stripe_payment_method_last4: null,
          stripe_payment_method_saved_at: null,
        })
        .eq("id", profile.id);
      if (customerSaveError) {
        throw new Error(`Impossible d'enregistrer le Customer Stripe: ${customerSaveError.message}`);
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: {
        profile_id: profile.id,
        consent_version: STRIPE_OFF_SESSION_CONSENT_VERSION,
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
    });
  } catch (err) {
    console.error("stripe/setup-intent error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
