import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";
import { hasPaidProfessionalCommission } from "@/lib/recommendation-review";

const isStripeCheckoutUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const { data: recommendation, error } = await supabaseAdmin
    .from("recommendations")
    .select("id, professional_id, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !recommendation) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }
  if (recommendation.professional_id !== user.id) {
    return NextResponse.json(
      { error: "Seul le professionnel concerné peut accéder à ce paiement." },
      { status: 403 },
    );
  }
  if (recommendation.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Le paiement sera disponible une fois la prestation confirmée par le client." },
      { status: 409 },
    );
  }
  if (await hasPaidProfessionalCommission(recommendation.id)) {
    return NextResponse.json({ error: "Cette commission est déjà réglée." }, { status: 409 });
  }

  try {
    const url = await createStripeCheckoutSession(recommendation.id, {
      notifyProfessional: false,
    });
    if (!isStripeCheckoutUrl(url)) {
      throw new Error("URL Stripe inattendue");
    }
    return NextResponse.json({ url });
  } catch (checkoutError) {
    console.error("[commission-payment-link] Stripe indisponible:", checkoutError);
    const businessMessage = checkoutError instanceof Error &&
      checkoutError.message === "Cette commission est déjà réglée ou en cours de confirmation."
        ? checkoutError.message
        : null;
    return NextResponse.json(
      { error: businessMessage ?? "Impossible de préparer le lien de paiement pour le moment." },
      { status: businessMessage ? 409 : 503 },
    );
  }
}
