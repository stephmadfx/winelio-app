import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Bypass de la collecte de carte Stripe en mode démo (NEXT_PUBLIC_DEMO_MODE=true).
 * Marque le profil comme ayant une carte enregistrée avec des valeurs factices
 * (`stripe_payment_method_id = "demo_pm_<userId>"`, brand "Visa (démo)", last4 "4242").
 *
 * Réservé strictement au mode démo : si la flag env n'est pas activée, on retourne 403.
 * Aucune action côté Stripe API n'est effectuée.
 */
export async function POST() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json(
      { error: "Bypass démo désactivé en production" },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const brand = "Visa (démo)";
  const last4 = "4242";

  const { error } = await supabase
    .from("profiles")
    .update({
      stripe_payment_method_id: `demo_pm_${user.id}`,
      stripe_payment_method_brand: brand,
      stripe_payment_method_last4: last4,
      stripe_payment_method_saved_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[stripe/demo-bypass] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, brand, last4 });
}
