import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/stripe/setup-intent
 *
 * Crée (ou récupère) un Stripe Customer pour le pro connecté, puis crée un
 * SetupIntent qui permettra de sauvegarder une carte sans débit immédiat.
 * Le client confirme ensuite la saisie via Stripe Elements, puis appelle
 * POST /api/stripe/payment-method pour persister le payment_method_id.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined,
        metadata: { profile_id: profile.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.id);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { profile_id: profile.id },
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
