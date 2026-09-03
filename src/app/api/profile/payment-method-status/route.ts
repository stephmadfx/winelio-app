import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { STRIPE_OFF_SESSION_CONSENT_VERSION } from "@/lib/stripe-off-session-consent";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("stripe_payment_method_id, stripe_payment_method_brand, stripe_payment_method_last4, stripe_off_session_consent_version, stripe_off_session_consent_at")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    hasPaymentMethod: !!profile?.stripe_payment_method_id,
    brand: profile?.stripe_payment_method_brand ?? null,
    last4: profile?.stripe_payment_method_last4 ?? null,
    hasCurrentOffSessionConsent:
      profile?.stripe_off_session_consent_version === STRIPE_OFF_SESSION_CONSENT_VERSION &&
      Boolean(profile?.stripe_off_session_consent_at),
  });
}
