import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendCommissionReminderEmail,
  sendCommissionAlertEmails,
} from "@/lib/notify-commission-payment";

const REMINDER_DELAY_MS = 48 * 60 * 60 * 1000; // 48h
const ALERT_DELAY_MS    = 48 * 60 * 60 * 1000; // 48h après la relance

export async function GET(req: Request) {
  // ── Auth cron ────────────────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let reminders = 0;
  let alerts = 0;

  // ── 1. Relances J+2 ──────────────────────────────────────────────────────────
  const reminderBefore = new Date(now.getTime() - REMINDER_DELAY_MS).toISOString();
  const { data: toRemind } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, stripe_session_id, amount, recommendation_id")
    .eq("status", "pending")
    .is("reminder_sent_at", null)
    .lt("created_at", reminderBefore);

  for (const session of toRemind ?? []) {
    try {
      // Récupérer ou recréer la Checkout Session Stripe
      const stripeSession = await stripe.checkout.sessions.retrieve(session.stripe_session_id);
      let checkoutUrl = stripeSession.url;

      if (stripeSession.status === "expired" || !checkoutUrl) {
        // Recréer une session Stripe à partir des données DB
        const { data: reco } = await supabaseAdmin
          .from("recommendations")
          .select("amount, professional_id, compensation_plan_id, contact:contact_id(first_name, last_name)")
          .eq("id", session.recommendation_id)
          .single();

        if (!reco?.amount) continue;

        const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
        const clientName = contact
          ? `${(contact as { first_name?: string; last_name?: string }).first_name ?? ""} ${(contact as { first_name?: string; last_name?: string }).last_name ?? ""}`.trim()
          : "Client";

        const newSession = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: { name: `Commission Winelio — ${clientName} (relance)` },
                unit_amount: Math.round((session.amount as number) * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            recommendation_id: session.recommendation_id,
            professional_id: (reco as { professional_id: string }).professional_id,
          },
          success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app"}?commission=paid`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://winelio.app"}?commission=cancelled`,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        });

        checkoutUrl = newSession.url;
        // Mettre à jour le stripe_session_id en DB
        await supabaseAdmin
          .from("stripe_payment_sessions")
          .update({ stripe_session_id: newSession.id })
          .eq("id", session.id);
      }

      if (!checkoutUrl) continue;

      // Récupérer les données nécessaires pour l'email
      const { data: reco } = await supabaseAdmin
        .from("recommendations")
        .select("professional_id, contact:contact_id(first_name, last_name)")
        .eq("id", session.recommendation_id)
        .single();

      if (!reco) continue;

      const contact = Array.isArray(reco.contact) ? reco.contact[0] : reco.contact;
      const clientName = contact
        ? `${(contact as { first_name?: string; last_name?: string }).first_name ?? ""} ${(contact as { first_name?: string; last_name?: string }).last_name ?? ""}`.trim()
        : "Client";

      await sendCommissionReminderEmail(
        (reco as { professional_id: string }).professional_id,
        clientName,
        session.amount as number,
        checkoutUrl
      );

      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({ reminder_sent_at: now.toISOString() })
        .eq("id", session.id);

      reminders++;
    } catch (err) {
      console.error(`[cron-reminders] Erreur session ${session.id}:`, err);
    }
  }

  // ── 2. Alertes J+4 (48h après la relance) ────────────────────────────────────
  const alertBefore = new Date(now.getTime() - ALERT_DELAY_MS).toISOString();
  const { data: toAlert } = await supabaseAdmin
    .from("stripe_payment_sessions")
    .select("id, recommendation_id")
    .eq("status", "pending")
    .is("alert_sent_at", null)
    .not("reminder_sent_at", "is", null)
    .lt("reminder_sent_at", alertBefore);

  for (const session of toAlert ?? []) {
    try {
      const { data: reco } = await supabaseAdmin
        .from("recommendations")
        .select("referrer_id, contact_id")
        .eq("id", session.recommendation_id)
        .single();

      if (!reco) continue;

      await sendCommissionAlertEmails(
        (reco as { contact_id: string }).contact_id,
        (reco as { referrer_id: string }).referrer_id
      );

      await supabaseAdmin
        .from("stripe_payment_sessions")
        .update({ alert_sent_at: now.toISOString() })
        .eq("id", session.id);

      alerts++;
    } catch (err) {
      console.error(`[cron-reminders] Erreur alerte ${session.id}:`, err);
    }
  }

  return NextResponse.json({ reminders, alerts, timestamp: now.toISOString() });
}
