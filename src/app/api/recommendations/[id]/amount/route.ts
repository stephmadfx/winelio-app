import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";

const MAX_QUOTE_AMOUNT = 1_000_000;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_QUOTE_AMOUNT) {
    return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
  }

  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, professional_id, status")
    .eq("id", id)
    .single();

  if (!rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  const isAdmin = user.app_metadata?.role === "super_admin";
  const isProfessional = rec.professional_id === user.id;
  if (!isAdmin && !isProfessional) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { count: paidCount } = await supabaseAdmin
    .schema("winelio")
    .from("stripe_payment_sessions")
    .select("id", { count: "exact", head: true })
    .eq("recommendation_id", rec.id)
    .eq("status", "paid");

  if ((paidCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Le devis ne peut plus être modifié après paiement de la commission." },
      { status: 409 }
    );
  }

  const { data: pendingSessions } = await supabaseAdmin
    .schema("winelio")
    .from("stripe_payment_sessions")
    .select("id, stripe_session_id")
    .eq("recommendation_id", rec.id)
    .eq("status", "pending");

  await Promise.allSettled(
    (pendingSessions ?? []).map(async (session) => {
      try {
        await stripe.checkout.sessions.expire(session.stripe_session_id);
      } catch (err) {
        console.warn("[recommendation-amount] Expiration Stripe impossible:", err);
      }

      await supabaseAdmin
        .schema("winelio")
        .from("stripe_payment_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
    })
  );

  const { error: updateError } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ amount })
    .eq("id", rec.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (rec.status === "COMPLETED") {
    await createStripeCheckoutSession(rec.id);
  }

  return NextResponse.json({ success: true, amount });
}
