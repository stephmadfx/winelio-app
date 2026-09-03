import { createHash } from "node:crypto";
import { test, expect } from "./fixtures/test";
import { createBasicChain } from "./helpers/scenarios";
import { cleanupE2EAccounts } from "./helpers/cleanup";
import { wn } from "./helpers/supabase";
import { stripe } from "../../src/lib/stripe";
import { collectCommissionAutomatically } from "../../src/lib/stripe-automatic-commission";
import {
  STRIPE_OFF_SESSION_CONSENT_TEXT,
  STRIPE_OFF_SESSION_CONSENT_VERSION,
  STRIPE_OFF_SESSION_TERMS_VERSION,
} from "../../src/lib/stripe-off-session-consent";

test("Stripe sandbox : débit automatique réel, finalisation et anti-doublon", async () => {
  test.skip(!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"), "Clé Stripe sandbox requise");

  let customerId: string | null = null;
  try {
    const { referrer, pro, companyId, contactId } = await createBasicChain();
    await wn().from("contacts").update({ email: "automatic-commission@example.invalid" }).eq("id", contactId);

    const customer = await stripe.customers.create({
      email: pro.email,
      metadata: { purpose: "winelio_automatic_commission_e2e" },
    });
    customerId = customer.id;

    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method: paymentMethod.id,
      payment_method_types: ["card"],
      usage: "off_session",
      confirm: true,
      metadata: {
        user_id: pro.id,
        consent_version: STRIPE_OFF_SESSION_CONSENT_VERSION,
      },
    });
    expect(setupIntent.status).toBe("succeeded");

    const { error: profileError } = await wn()
      .from("profiles")
      .update({
        stripe_customer_id: customer.id,
        stripe_payment_method_id: paymentMethod.id,
        stripe_payment_method_brand: "visa",
        stripe_payment_method_last4: "4242",
        stripe_payment_method_saved_at: new Date().toISOString(),
        stripe_off_session_consent_version: STRIPE_OFF_SESSION_CONSENT_VERSION,
        stripe_off_session_consent_at: new Date().toISOString(),
      })
      .eq("id", pro.id);
    expect(profileError).toBeNull();

    const { error: consentError } = await wn().from("stripe_payment_method_consents").insert({
      user_id: pro.id,
      setup_intent_id: setupIntent.id,
      payment_method_id: paymentMethod.id,
      consent_version: STRIPE_OFF_SESSION_CONSENT_VERSION,
      consent_text: STRIPE_OFF_SESSION_CONSENT_TEXT,
      terms_version: STRIPE_OFF_SESSION_TERMS_VERSION,
      terms_hash: createHash("sha256").update(STRIPE_OFF_SESSION_CONSENT_TEXT).digest("hex"),
      user_agent: "Winelio automatic commission E2E",
    });
    expect(consentError).toBeNull();

    const { data: plan } = await wn()
      .from("compensation_plans")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    expect(plan?.id).toBeTruthy();

    const { data: recommendation, error: recommendationError } = await wn()
      .from("recommendations")
      .insert({
        referrer_id: referrer.id,
        professional_id: pro.id,
        company_id: companyId,
        contact_id: contactId,
        compensation_plan_id: plan!.id,
        project_description: "Débit automatique Stripe sandbox",
        urgency_level: "normal",
        status: "PAYMENT_RECEIVED",
        amount: 10,
        is_demo: false,
      })
      .select("id")
      .single();
    expect(recommendationError).toBeNull();

    process.env.STRIPE_AUTOMATIC_COMMISSION_ENABLED = "true";
    const first = await collectCommissionAutomatically(recommendation!.id);
    expect(first).toEqual({ mode: "automatic_card", status: "paid" });

    const second = await collectCommissionAutomatically(recommendation!.id);
    expect(second).toEqual({ mode: "automatic_card", status: "paid" });

    const { data: payments } = await wn()
      .from("stripe_payment_sessions")
      .select("status, payment_mode, amount, stripe_payment_intent_id")
      .eq("recommendation_id", recommendation!.id);
    expect(payments).toHaveLength(1);
    expect(payments?.[0]).toMatchObject({
      status: "paid",
      payment_mode: "automatic_card",
      amount: 1,
    });

    const intent = await stripe.paymentIntents.retrieve(payments![0].stripe_payment_intent_id!);
    expect(intent.status).toBe("succeeded");
    expect(intent.amount_received).toBe(100);
    expect(intent.currency).toBe("eur");

    const { count: commissionCount } = await wn()
      .from("commission_transactions")
      .select("id", { count: "exact", head: true })
      .eq("recommendation_id", recommendation!.id);
    expect(commissionCount).toBeGreaterThan(0);
  } finally {
    delete process.env.STRIPE_AUTOMATIC_COMMISSION_ENABLED;
    if (customerId) {
      await stripe.customers.del(customerId).catch(() => undefined);
    }
    await cleanupE2EAccounts();
  }
});
